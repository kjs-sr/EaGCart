const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const userModel = require("../models/userModel");

// --- 페이지 렌더링 ---
exports.renderLogin = (req, res) => res.render("auth/login");
exports.renderRegister = (req, res) => res.render("auth/register");
exports.renderRecovery = (req, res) => res.render("auth/recovery");

// --- 이메일 설정 ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

const ID_REGEX = /^[a-z0-9]{5,20}$/;
const PW_REGEX = /^[a-zA-Z0-9!@#$%^&*]{8,20}$/;

// 1. 이메일 인증번호 발송
exports.sendVerificationCode = async (req, res) => {
  const { email, type } = req.body;
  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "이메일을 입력해주세요." });

  const code = Math.floor(100000 + Math.random() * 900000).toString();

  req.session.verification = {
    code: code,
    email: email,
    expires: Date.now() + 5 * 60 * 1000,
    isVerified: false,
  };

  let subject = "[EaGCart] 인증번호 안내";
  let html = "";

  const commonStyle = `
    <div style="font-family: 'Apple SD Gothic Neo', sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 500px;">
      <h2 style="color: #6d28d9;">EaGCart</h2>
  `;

  if (type === "register") {
    subject = "[EaGCart] 회원가입을 환영합니다! 인증번호 안내";
    html = `
      ${commonStyle}
      <h3 style="margin-top: 0;">회원가입 인증번호</h3>
      <p>안녕하세요, EaGCart 가입을 진행해 주셔서 감사합니다.</p>
      <p>아래 인증번호 6자리를 입력하여 가입을 완료해 주세요.</p>
      <div style="background: #f3f4f6; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #333;">
        ${code}
      </div>
      <p style="color: #888; font-size: 12px;">* 본 인증번호는 5분간 유효합니다.</p>
    </div>`;
  } else if (type === "change") {
    subject = "[EaGCart] 이메일 변경 인증번호 안내";
    html = `
      ${commonStyle}
      <h3 style="margin-top: 0;">이메일 변경 인증</h3>
      <p>안녕하세요, 회원님의 이메일 정보를 안전하게 변경하기 위해 본인 확인이 필요합니다.</p>
      <div style="background: #fffbe6; border: 1px solid #ffe58f; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #d48806;">
        ${code}
      </div>
    </div>`;
  } else if (type === "find") {
    subject = "[EaGCart] 계정 찾기 본인 확인";
    html = `
      ${commonStyle}
      <h3 style="margin-top: 0;">본인 확인 인증번호</h3>
      <p>계정 정보를 찾기 위한 인증번호입니다.</p>
      <div style="background: #f0f5ff; border: 1px solid #adc6ff; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #2f54eb;">
        ${code}
      </div>
    </div>`;
  } else {
    subject = "[EaGCart] 이메일 인증번호 안내";
    html = `<p>인증번호는 <b>[${code}]</b> 입니다.</p>`;
  }

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: email,
    subject: subject,
    html: html,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "인증번호가 전송되었습니다." });
  } catch (error) {
    console.error("Email send error:", error);
    res.status(500).json({ success: false, message: "이메일 전송 실패" });
  }
};

// 2. 인증번호 확인
exports.verifyCode = (req, res) => {
  const { code } = req.body;
  const sessionAuth = req.session.verification;

  if (!sessionAuth || sessionAuth.expires < Date.now()) {
    return res
      .status(400)
      .json({ success: false, message: "인증번호가 만료되었습니다." });
  }

  if (sessionAuth.code === code) {
    sessionAuth.isVerified = true;
    req.session.save();
    return res.json({ success: true, message: "인증되었습니다." });
  } else {
    return res
      .status(400)
      .json({ success: false, message: "인증번호가 일치하지 않습니다." });
  }
};

// 3. 중복 체크
exports.checkDuplicate = async (req, res) => {
  const { type, value } = req.body;
  try {
    let exists = false;
    if (type === "id") {
      const userId = value.toLowerCase();
      if (!ID_REGEX.test(userId))
        return res.json({
          success: false,
          message: "아이디 형식이 맞지 않습니다.",
        });
      const user = await userModel.findUserById(userId);
      if (user) exists = true;
    } else if (type === "nickname") {
      const user = await userModel.findUserByNickname(value);
      if (user) exists = true;
    } else if (type === "email") {
      const user = await userModel.findUserByEmail(value);
      if (user) exists = true;
    }
    res.json({ success: true, exists });
  } catch (err) {
    res.status(500).json({ success: false, message: "서버 오류" });
  }
};

// 4. 회원가입
exports.register = async (req, res) => {
  let { userId, nickname, password, email } = req.body;
  const sessionAuth = req.session.verification;

  if (!sessionAuth || !sessionAuth.isVerified || sessionAuth.email !== email) {
    return res
      .status(400)
      .send("<script>alert('인증 미완료'); history.back();</script>");
  }

  userId = userId.toLowerCase();

  if (!ID_REGEX.test(userId) || !PW_REGEX.test(password)) {
    return res
      .status(400)
      .send("<script>alert('형식 오류'); history.back();</script>");
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await userModel.createUser({
      userId,
      nickname,
      password: hashedPassword,
      email,
    });
    delete req.session.verification;
    res.send(
      "<script>alert('회원가입이 완료되었습니다!'); location.href='/login';</script>"
    );
  } catch (err) {
    res
      .status(500)
      .send("<script>alert('가입 실패'); history.back();</script>");
  }
};

// 5. 로그인 (제재 사유 확인 로직 추가됨)
exports.login = async (req, res) => {
  let { userId, password } = req.body;
  userId = userId.toLowerCase();

  try {
    const user = await userModel.findUserById(userId);

    // 1. 아이디/비번 확인
    if (!user || !(await bcrypt.compare(password, user.USER_PASSWORD))) {
      return res
        .status(400)
        .send(
          "<script>alert('아이디 또는 비밀번호가 잘못되었습니다.'); history.back();</script>"
        );
    }

    // 2. 상태 확인 (제재 사유 출력)
    if (user.STATUS !== "ACTIVE" && user.STATUS !== "ADMIN") {
      let msg = "로그인이 제한된 계정입니다.";

      if (user.STATUS === "BANNED") {
        // [수정] 제재 사유(BAN_REASON)가 있으면 출력, 없으면 기본 메시지
        const reason = user.BAN_REASON
          ? user.BAN_REASON
          : "관리자에게 문의하세요.";
        // 줄바꿈(\n)을 사용하여 알림창에서 줄바꿈 처리
        msg = `[이용 정지] 로그인이 차단되었습니다.\\n--------------------------------\\n사유: ${reason}`;
      } else if (user.STATUS === "WITHDRAWN") {
        msg = "탈퇴한 계정입니다. 복구는 관리자에게 문의하세요."; // [수정됨] 문구 변경
      } else {
        msg += ` (상태코드: ${user.STATUS})`;
      }

      return res
        .status(403)
        .send(`<script>alert('${msg}'); history.back();</script>`);
    }

    // 3. 세션 저장
    req.session.user = {
      code: user.USER_CODE,
      id: user.USER_ID,
      nickname: user.USER_NAME,
      email: user.EMAIL,
      status: user.STATUS,
    };

    req.session.save(() => {
      res.redirect("/");
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send(
        "<script>alert('로그인 처리 중 오류 발생'); history.back();</script>"
      );
  }
};

// 6. 로그아웃
exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
};

// 7. 아이디 찾기
exports.findId = async (req, res) => {
  const { email } = req.body;
  const sessionAuth = req.session.verification;
  if (!sessionAuth || !sessionAuth.isVerified || sessionAuth.email !== email) {
    return res.status(400).json({
      success: false,
      message: "이메일 인증 정보가 유효하지 않습니다.",
    });
  }

  try {
    const user = await userModel.findUserByEmail(email);
    if (user) {
      const fullId = user.USER_ID;
      const visiblePart = fullId.substring(0, 3);
      const maskedPart = "*".repeat(fullId.length - 3);
      const maskedId = visiblePart + maskedPart;
      res.json({
        success: true,
        message: `회원님의 아이디는 [ ${maskedId} ] 입니다.`,
      });
    } else {
      res.json({ success: false, message: "가입된 정보가 없습니다." });
    }
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 8. 비밀번호 찾기 (임시비번 발송)
exports.findPw = async (req, res) => {
  let { userId, email } = req.body;
  userId = userId.toLowerCase();
  const sessionAuth = req.session.verification;

  if (!sessionAuth || !sessionAuth.isVerified || sessionAuth.email !== email) {
    return res.status(400).json({
      success: false,
      message: "이메일 인증 정보가 유효하지 않습니다.",
    });
  }

  try {
    const user = await userModel.findUserById(userId);
    if (!user || user.EMAIL !== email) {
      return res.json({
        success: false,
        message: "일치하는 회원 정보가 없습니다.",
      });
    }

    const tempPassword = Math.random().toString(36).slice(-8) + "!1";
    const hashedTempPw = await bcrypt.hash(tempPassword, 10);

    await userModel.updatePassword(userId, hashedTempPw);

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: "[EaGCart] 임시 비밀번호 발급 안내",
      text: `회원님의 임시 비밀번호는 [ ${tempPassword} ] 입니다. 로그인 후 반드시 비밀번호를 변경해주세요.`,
    };
    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: "이메일로 임시 비밀번호가 전송되었습니다.",
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "처리 중 오류가 발생했습니다." });
  }
};

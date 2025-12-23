const qnaModel = require("../models/qnaModel");

// 1. 문의 메인 페이지 (랜딩)
exports.renderLanding = (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  // 로그인 체크는 미들웨어나 개별 페이지에서 처리 (여기선 렌더링만)
  res.render("qna/index", { user: currentUser });
};

// 2. 문의 작성 페이지
exports.renderWrite = (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res
      .status(401)
      .send(
        "<script>alert('로그인이 필요합니다.'); location.href='/login';</script>"
      );
  }
  res.render("qna/write", { user: currentUser });
};

// 3. 문의 등록 처리 (POST)
exports.createInquiry = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res
      .status(401)
      .send(
        "<script>alert('로그인이 필요합니다.'); location.href='/login';</script>"
      );
  }

  const { title, content } = req.body;
  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  try {
    await qnaModel.createInquiry(userCode, title, content);
    res.send(
      "<script>alert('문의가 등록되었습니다.'); location.href='/qna/history';</script>"
    );
  } catch (err) {
    console.error("Inquiry create error:", err);
    res
      .status(500)
      .send("<script>alert('오류가 발생했습니다.'); history.back();</script>");
  }
};

// 4. 문의 내역 페이지
exports.renderHistory = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res
      .status(401)
      .send(
        "<script>alert('로그인이 필요합니다.'); location.href='/login';</script>"
      );
  }

  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  try {
    const tickets = await qnaModel.getMyInquiries(userCode);
    res.render("qna/history", {
      user: currentUser,
      qna: { tickets: tickets },
    });
  } catch (err) {
    console.error("Inquiry history error:", err);
    res.status(500).send("문의 내역을 불러오는 중 오류가 발생했습니다.");
  }
};

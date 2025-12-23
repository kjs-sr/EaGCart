const userModel = require("../models/userModel");
const bcrypt = require("bcrypt");

// --- 페이지 렌더링 ---

// 1. 프로필 페이지 (내 정보 조회 후 전달)
exports.renderProfile = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    // 세션 정보보다 최신 DB 정보를 가져오는 것이 안전함
    const user = await userModel.findUserById(req.session.user.id);

    res.render("mypage/profile", {
      activeTab: "profile",
      mypage: {
        profile: {
          userId: user.USER_ID,
          nickname: user.USER_NAME,
          email: user.EMAIL,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.send(
      "<script>alert('정보를 불러오는데 실패했습니다.'); history.back();</script>"
    );
  }
};

// 2. 주문 내역 페이지 (필터링 적용)
exports.renderOrders = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    let userCode = req.session.user.code || req.session.user.USER_CODE;
    if (!userCode) {
      const user = await userModel.findUserById(req.session.user.id);
      userCode = user.USER_CODE;
    }

    // 1. 쿼리 파라미터에서 필터 값 가져오기
    let { startDate, endDate, search } = req.query;

    // 2. 기본값 설정 (오늘 ~ 3개월 전)
    if (!endDate) {
      const today = new Date();
      // YYYY-MM-DD 형식으로 변환
      endDate = today.toISOString().split("T")[0];
    }

    if (!startDate) {
      const end = new Date(endDate);
      const start = new Date(end);
      start.setMonth(start.getMonth() - 3); // 3개월 전
      startDate = start.toISOString().split("T")[0];
    }

    // 3. 모델 호출
    const orders = await userModel.getUserOrders(
      userCode,
      startDate,
      endDate,
      search
    );

    // 4. 뷰 렌더링 (필터 상태 유지)
    res.render("mypage/orders", {
      activeTab: "orders",
      mypage: { orders: orders },
      filters: {
        startDate: startDate,
        endDate: endDate,
        search: search || "",
      },
      user: req.session.user,
    });
  } catch (err) {
    console.error("Render Orders Error:", err);
    res.status(500).send("주문 내역을 불러오는 중 오류가 발생했습니다.");
  }
};

// 3. 찜 리스트
exports.renderWishlist = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    let userCode = req.session.user.code || req.session.user.USER_CODE;

    if (!userCode) {
      const user = await userModel.findUserById(req.session.user.id);
      userCode = user.USER_CODE;
    }

    const items = await userModel.getWishlistItems(userCode);

    res.render("mypage/wishlist", {
      activeTab: "wishlist",
      mypage: { wishlist: items },
    });
  } catch (err) {
    console.error("Render Wishlist Error:", err);
    res.status(500).send("찜 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// 4. 리뷰 관리 (플레이스홀더)
exports.renderReviews = (req, res) =>
  res.render("mypage/reviews", {
    activeTab: "reviews",
    mypage: { reviewCards: [] },
  });

// 5. 보유 쿠폰 페이지 (뷰 로직 이동)
exports.renderCoupons = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  try {
    let userCode = req.session.user.code || req.session.user.USER_CODE;
    if (!userCode) {
      const user = await userModel.findUserById(req.session.user.id);
      userCode = user.USER_CODE;
    }

    const rawCoupons = await userModel.getUserCoupons(userCode);

    // [핵심 개선] 뷰에서 처리하던 로직을 여기서 미리 가공합니다.
    const processedCoupons = rawCoupons.map((coupon) => {
      let bgClass = "bg-white border-purple-200";
      let textClass = "text-purple-600";
      let statusText = `${coupon.remaining}일 남음`;
      let isExpired = false;

      if (coupon.status === "USED") {
        bgClass = "bg-gray-50 border-gray-200 opacity-60";
        textClass = "text-gray-400";
        statusText = "사용 완료";
        isExpired = true;
      } else if (parseInt(coupon.remaining) < 0) {
        bgClass = "bg-gray-50 border-gray-200 opacity-60";
        textClass = "text-rose-400";
        statusText = "기간 만료";
        isExpired = true;
      }

      // 최대 할인 문구
      let limitText = "";
      if (coupon.type === "RATE" && coupon.limit) {
        limitText = `최대 ${parseInt(coupon.limit).toLocaleString()}원 할인`;
      }

      return {
        ...coupon,
        bgClass,
        textClass,
        statusText,
        limitText,
        isExpired,
      };
    });

    res.render("mypage/coupons", {
      activeTab: "coupons",
      mypage: { coupons: processedCoupons },
    });
  } catch (err) {
    console.error("Render Coupons Error:", err);
    res.status(500).send("쿠폰 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// --- 기능 로직 ---

// 2. 회원 정보 수정
exports.updateProfile = async (req, res) => {
  const currentUser = req.session.user;
  if (!currentUser)
    return res
      .status(401)
      .json({ success: false, message: "로그인이 필요합니다." });

  const { nickname, currentPassword, newPassword, email } = req.body;

  try {
    // 1) 현재 비밀번호 검증 (필수)
    const userDB = await userModel.findUserById(currentUser.id);
    if (
      !userDB ||
      !(await bcrypt.compare(currentPassword, userDB.USER_PASSWORD))
    ) {
      return res.json({
        success: false,
        message: "현재 비밀번호가 일치하지 않습니다.",
      });
    }

    // 2) 닉네임 중복 체크 (변경 시에만)
    if (nickname !== userDB.USER_NAME) {
      const existNick = await userModel.findUserByNickname(nickname);
      if (existNick)
        return res.json({
          success: false,
          message: "이미 사용 중인 닉네임입니다.",
        });
    }

    // 3) 이메일 변경 시 인증 확인 (세션 검사)
    if (email !== userDB.EMAIL) {
      const sessionAuth = req.session.verification;
      if (
        !sessionAuth ||
        !sessionAuth.isVerified ||
        sessionAuth.email !== email
      ) {
        return res.json({
          success: false,
          message: "변경된 이메일 인증이 완료되지 않았습니다.",
        });
      }
    }

    // 4) 업데이트 데이터 준비
    const updateData = {
      nickname: nickname,
      email: email,
    };

    // 새 비밀번호가 있으면 암호화하여 포함
    if (newPassword && newPassword.trim() !== "") {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    // 5) DB 업데이트
    await userModel.updateUser(currentUser.id, updateData);

    // 6) 세션 정보 갱신
    req.session.user.nickname = nickname;
    req.session.user.email = email;
    req.session.save(); // 저장 후 응답

    res.json({ success: true, message: "회원 정보가 수정되었습니다." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

// 3. 회원 탈퇴
exports.withdraw = async (req, res) => {
  const currentUser = req.session.user;
  if (!currentUser)
    return res
      .status(401)
      .json({ success: false, message: "로그인이 필요합니다." });

  const { currentPassword } = req.body;

  try {
    // 비밀번호 확인
    const userDB = await userModel.findUserById(currentUser.id);
    if (
      !userDB ||
      !(await bcrypt.compare(currentPassword, userDB.USER_PASSWORD))
    ) {
      return res.json({
        success: false,
        message: "비밀번호가 일치하지 않습니다.",
      });
    }

    // 상태 변경 (ACTIVE -> WITHDRAWN)
    await userModel.withdrawUser(currentUser.id);

    // 세션 파괴 (로그아웃)
    req.session.destroy();

    res.json({
      success: true,
      message: "정상적으로 탈퇴되었습니다. 이용해 주셔서 감사합니다.",
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "탈퇴 처리 중 오류가 발생했습니다." });
  }
};

// [신규] 주문 상세 품목 조회 API (모달용)
exports.getOrderDetailApi = async (req, res) => {
  if (!req.session.user)
    return res.status(401).json({ success: false, message: "로그인 필요" });

  const { id } = req.params; // orderCode
  try {
    const items = await userModel.getOrderItems(id);
    res.json({ success: true, items: items });
  } catch (err) {
    console.error("Get Order Items Error:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
};

// [신규] 주문 취소 처리
exports.cancelOrder = async (req, res) => {
  if (!req.session.user)
    return res
      .status(401)
      .json({ success: false, message: "로그인이 필요합니다." });

  const { orderId } = req.body;
  // 세션에서 userCode 확인 (없으면 ID로 조회)
  let userCode = req.session.user.code || req.session.user.USER_CODE;

  if (!userCode) {
    try {
      const user = await userModel.findUserById(req.session.user.id);
      userCode = user.USER_CODE;
    } catch (e) {
      return res
        .status(500)
        .json({ success: false, message: "사용자 정보를 찾을 수 없습니다." });
    }
  }

  try {
    await userModel.cancelOrder(orderId, userCode);
    res.json({ success: true, message: "주문이 취소되었습니다." });
  } catch (err) {
    console.error("Cancel Order Error:", err);
    res
      .status(500)
      .json({ success: false, message: "주문 취소에 실패했습니다." });
  }
};

const couponModel = require("../models/couponModel");

// 쿠폰 존 페이지 렌더링
exports.renderCouponZone = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res.send(
      "<script>alert('로그인이 필요한 서비스입니다.'); location.href='/login';</script>"
    );
  }

  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  try {
    const coupons = await couponModel.getAvailableCoupons(userCode);

    res.render("coupon/index", {
      user: currentUser,
      coupons: coupons,
    });
  } catch (err) {
    console.error("Coupon Zone Error:", err);
    res.status(500).send("쿠폰 정보를 불러오는 중 오류가 발생했습니다.");
  }
};

// 쿠폰 다운로드 API
exports.downloadCoupon = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res
      .status(401)
      .json({ success: false, message: "로그인이 필요합니다." });
  }

  const { couponCode } = req.body;
  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  try {
    const result = await couponModel.issueCouponToUser(userCode, couponCode);
    res.json(result);
  } catch (err) {
    console.error("Download Coupon Error:", err);
    res
      .status(500)
      .json({ success: false, message: "서버 오류가 발생했습니다." });
  }
};

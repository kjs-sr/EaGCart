const couponModel = require("../../models/couponModel");

// 쿠폰 관리 페이지 렌더링
exports.renderCoupon = async (req, res) => {
  try {
    const coupons = await couponModel.getCouponList();
    res.render("admin/coupon", {
      active: "coupon",
      admin: { couponTable: coupons },
    });
  } catch (err) {
    console.error("Render Coupon Error:", err);
    res.status(500).send("쿠폰 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// 쿠폰 생성 API
exports.createCoupon = async (req, res) => {
  const { name, description, type, value, maxDiscount, startDate, endDate } =
    req.body;

  if (!name || !value || !startDate || !endDate) {
    return res
      .status(400)
      .json({ success: false, message: "필수 정보를 입력해주세요." });
  }

  try {
    await couponModel.createCoupon({
      name,
      description,
      type,
      value,
      maxDiscount,
      startDate,
      endDate,
    });
    res.json({ success: true, message: "쿠폰이 생성되었습니다." });
  } catch (err) {
    console.error("Create Coupon Error:", err);
    res.status(500).json({ success: false, message: "생성 실패" });
  }
};

// 쿠폰 상세 조회 API
exports.getCouponDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const coupon = await couponModel.getCouponDetail(id);
    if (!coupon)
      return res
        .status(404)
        .json({ success: false, message: "쿠폰을 찾을 수 없습니다." });
    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ success: false, message: "오류 발생" });
  }
};

// 쿠폰 수정 API
exports.updateCoupon = async (req, res) => {
  try {
    await couponModel.updateCoupon(req.body);
    res.json({ success: true, message: "쿠폰이 수정되었습니다." });
  } catch (err) {
    console.error("Update Coupon Error:", err);
    res.status(500).json({ success: false, message: "수정 실패" });
  }
};

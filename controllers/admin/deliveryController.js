const deliveryModel = require("../../models/deliveryModel");

// 페이지 렌더링
exports.renderDelivery = async (req, res) => {
  try {
    const deliveries = await deliveryModel.getDeliveryList();
    res.render("admin/delivery", {
      active: "delivery",
      admin: { deliveries: deliveries },
    });
  } catch (err) {
    console.error("Render Delivery Error:", err);
    res.status(500).send("오류가 발생했습니다.");
  }
};

// 주문 상품 상세 조회 API
exports.getDeliveryDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const items = await deliveryModel.getDeliveryItems(id);
    res.json({ success: true, items: items });
  } catch (err) {
    console.error("Get Delivery Detail Error:", err);
    res
      .status(500)
      .json({ success: false, message: "상품 정보를 불러오지 못했습니다." });
  }
};

// [수정] 배송 정보(상태 및 날짜) 변경 API
exports.updateStatus = async (req, res) => {
  const { code, status, date } = req.body;
  // date: 관리자가 모달에서 선택한 날짜
  try {
    await deliveryModel.updateDeliveryInfo(code, status, date);
    res.json({ success: true, message: "배송 정보가 변경되었습니다." });
  } catch (err) {
    console.error("Update Status Error:", err);
    res.status(500).json({ success: false, message: "정보 변경 실패" });
  }
};

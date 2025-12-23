const userModel = require("../models/userModel");

// 반품/교환 신청 페이지 렌더링
exports.renderClaimPage = async (req, res) => {
  const orderId = req.params.id;
  try {
    const rawItems = await userModel.getOrderItems(orderId);

    // [수정] 뷰(EJS)의 부담을 줄이기 위해 여기서 데이터 가공
    const items = rawItems.map((item) => {
      const isClaimed = [
        "RETURN_REQUESTED",
        "EXCHANGE_REQUESTED",
        "RETURNED",
        "EXCHANGED",
      ].includes(item.status);
      let statusText = "";

      if (item.status === "RETURN_REQUESTED") statusText = "(반품 신청됨)";
      else if (item.status === "EXCHANGE_REQUESTED")
        statusText = "(교환 신청됨)";
      else if (item.status === "RETURNED") statusText = "(반품 완료)";
      else if (item.status === "EXCHANGED") statusText = "(교환 완료)";

      return {
        ...item,
        isClaimed, // true/false
        statusText, // 표시할 텍스트
      };
    });

    res.render("mypage/order_claim", {
      activeTab: "orders",
      orderId: orderId,
      items: items, // 가공된 아이템 목록 전달
      mypage: {
        user: req.user,
      },
    });
  } catch (err) {
    console.error("Render Claim Page Error:", err);
    res
      .status(500)
      .send(
        "<script>alert('오류가 발생했습니다.'); location.href='/mypage/orders';</script>"
      );
  }
};

// 신청 처리 로직 (기존 동일)
exports.processClaim = async (req, res) => {
  let { orderId, selectedItems, claimType, reasonCode, reasonDetail } =
    req.body;

  if (!selectedItems) selectedItems = [];
  else if (!Array.isArray(selectedItems)) selectedItems = [selectedItems];

  if (selectedItems.length === 0) {
    return res.send(
      "<script>alert('상품을 선택해주세요.'); history.back();</script>"
    );
  }

  if (!reasonCode) {
    return res.send(
      "<script>alert('사유를 선택해주세요.'); history.back();</script>"
    );
  }

  try {
    await userModel.requestClaim(
      orderId,
      selectedItems,
      claimType,
      reasonCode,
      reasonDetail
    );
    res.send(
      "<script>alert('신청이 정상적으로 접수되었습니다.'); location.href='/mypage/orders';</script>"
    );
  } catch (err) {
    console.error("Claim Process Error:", err);
    res.send(
      "<script>alert('신청 처리에 실패했습니다.'); history.back();</script>"
    );
  }
};

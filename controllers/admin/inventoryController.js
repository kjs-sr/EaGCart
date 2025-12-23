const inventoryModel = require("../../models/inventoryModel");
// 재고 관리 페이지 렌더링
exports.renderInventory = async (req, res) => {
  try {
    // 1. 전체 상품 목록 가져오기
    const rawInventory = await inventoryModel.getInventoryList();

    // 2. 데이터 가공: 안전 재고(safety) 계산 추가
    const inventory = rawInventory.map((item) => {
      const current = item.current || 0;
      const target = item.target || 0;
      // [추가] 안전 재고 = 적정 재고의 60% (내림)
      const safety = Math.floor(target * 0.6);

      return {
        ...item,
        current,
        target,
        safety, // 뷰에서 사용하기 위해 추가
      };
    });

    // 3. 재고 부족 알림 데이터 필터링
    // [변경] 조건: 현재 재고 < 안전 재고 (기존: 현재 < 적정)
    const alerts = inventory
      .filter((item) => item.current < item.safety)
      .map((item) => ({
        ...item,
        // 부족분은 '적정 재고'까지 채우기 위해 필요한 수량으로 계산 (선택 사항)
        // 여기서는 (적정 - 현재)로 하여 여유 있게 채우도록 유도
        shortage: item.target - item.current,
      }));

    res.render("admin/inventory", {
      active: "inventory",
      admin: {
        inventory: inventory,
        alerts: alerts,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("재고 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// 적정 재고 자동 계산 API
exports.calculateOptimalStock = async (req, res) => {
  const { code } = req.body;

  try {
    // 1. 최근 3개월 총 판매량 조회
    const totalSold = await inventoryModel.getOrderCountLast3Months(code);

    // 2. 월 평균 판매량 계산 (3으로 나눔)
    const monthlyAverage = totalSold / 3;

    // 3. 적정 재고 계산 (평균 * 1.5)
    let optimal = Math.ceil(monthlyAverage * 1.5);

    // 4. 최소값(30) 보정
    if (optimal < 30) {
      optimal = 30;
    }

    res.json({
      success: true,
      optimal: optimal,
      message: `최근 3개월 판매량(${totalSold}개)을 기반으로 계산되었습니다.`,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "계산 중 오류가 발생했습니다." });
  }
};

// 재고 업데이트 처리
exports.updateStock = async (req, res) => {
  const { code, current, optimal } = req.body;

  try {
    // 유효성 검사
    if (!code || current === undefined || optimal === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "필수 정보가 누락되었습니다." });
    }

    await inventoryModel.updateProductStock(code, current, optimal);

    res.json({ success: true, message: "재고 정보가 수정되었습니다." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "재고 수정 중 오류가 발생했습니다." });
  }
};

// 입고 처리 API
exports.addInbound = async (req, res) => {
  const { code, quantity } = req.body;

  try {
    // 유효성 검사
    if (!code || !quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "유효한 입고 수량을 입력해주세요." });
    }

    await inventoryModel.addInbound(code, parseInt(quantity));

    res.json({
      success: true,
      message: `${quantity}개 입고 처리가 완료되었습니다.`,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "입고 처리 중 오류가 발생했습니다." });
  }
};

// [추가] 입고 내역 조회 API
exports.getInboundHistoryList = async (req, res) => {
  const { startDate, endDate, search } = req.query;

  try {
    const history = await inventoryModel.getInboundHistory(
      startDate,
      endDate,
      search
    );
    res.json({ success: true, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "내역 조회 실패" });
  }
};

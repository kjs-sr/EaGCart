const discountModel = require("../../models/discountModel");
const scheduler = require("../../utils/scheduler"); // [신규] 스케줄러 추가

// 할인 관리 페이지 렌더링
exports.renderDiscount = async (req, res) => {
  try {
    const discounts = await discountModel.getDiscountList();
    res.render("admin/discount", {
      active: "discount",
      admin: { discountTable: discounts },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("할인 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// 할인 등록 처리
exports.createDiscount = async (req, res) => {
  const { productCodes, discountValue, startDate, endDate } = req.body;

  try {
    if (
      !productCodes ||
      productCodes.length === 0 ||
      !discountValue ||
      !startDate ||
      !endDate
    ) {
      return res
        .status(400)
        .json({ success: false, message: "필수 정보를 모두 입력해주세요." });
    }

    const overlappingProducts = await discountModel.checkDiscountOverlap(
      productCodes,
      startDate,
      endDate
    );

    if (overlappingProducts.length > 0) {
      return res.json({
        success: false,
        message: `다음 상품은 해당 기간에 이미 할인이 존재합니다:\n${overlappingProducts.join(
          ", "
        )}`,
      });
    }

    await discountModel.createDiscount({
      productCodes,
      discountType: "rate",
      discountValue: parseInt(discountValue),
      startDate,
      endDate,
    });

    // [신규] 할인 등록 완료 후 알림 발송 (비동기 실행)
    scheduler.sendDiscountAlert(productCodes).catch(console.error);

    res.json({ success: true, message: "할인이 등록되었습니다." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "할인 등록 중 오류가 발생했습니다." });
  }
};

// 할인 상세 조회 API
exports.getDiscountDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const discount = await discountModel.getDiscountByCode(id);
    if (!discount)
      return res
        .status(404)
        .json({ success: false, message: "정보를 찾을 수 없습니다." });
    res.json({ success: true, discount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "조회 실패" });
  }
};

// 할인 수정 API
exports.updateDiscount = async (req, res) => {
  const { code, discountValue, startDate, endDate, productCode } = req.body; // productCode 필요
  try {
    await discountModel.updateDiscount({
      code,
      rate: discountValue,
      startDate,
      endDate,
    });

    // [신규] 할인 정보 수정 시에도 알림 발송 (대상 상품 코드를 알아야 함)
    // 뷰에서 넘겨주는 body에 productCode가 포함되어 있다고 가정, 혹은 DB 조회 필요
    // 여기서는 간단히 productCode가 있다면 발송하는 것으로 처리
    if (productCode) {
      scheduler.sendDiscountAlert([productCode]).catch(console.error);
    }

    res.json({ success: true, message: "할인 정보가 수정되었습니다." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "수정 실패" });
  }
};

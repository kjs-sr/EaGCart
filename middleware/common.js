const productModel = require("../models/productModel");

exports.loadCommonData = async (req, res, next) => {
  try {
    // 1. 기기 목록
    const devices = await productModel.getDevices();
    // 2. 카테고리 목록
    const categories = await productModel.getCategories();

    // 뷰에서 사용할 수 있게 locals에 저장
    res.locals.common = {
      devices,
      categories,
    };

    // 로그인 유저 정보도 locals에 저장 (기존 server.js 로직 이동)
    res.locals.user = req.session.user || null;

    next();
  } catch (err) {
    console.error("Common Data Load Error:", err);
    // 에러가 나더라도 페이지는 떠야 하므로 빈 배열로 설정 후 진행
    res.locals.common = { devices: [], categories: [] };
    res.locals.user = req.session.user || null;
    next();
  }
};

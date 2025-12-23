const db = require("../config/db");
const bannerModel = require("../models/bannerModel");
const productModel = require("../models/productModel");

// 메인 페이지 데이터 통합 조회 컨트롤러
exports.getHomePage = async (req, res) => {
  try {
    const banners = await bannerModel.getBanners();
    const products = await productModel.getMainProductList();
    const discountProducts = await productModel.getDiscountedProductList();
    const currentUser = req.user || (req.session && req.session.user) || null;

    return res.render("index", {
      user: currentUser,
      banners: banners,
      products: products,
      discountProducts: discountProducts,
    });
  } catch (err) {
    console.error("Main page loading error:", err);
    return res.render("index", {
      user: req.user || (req.session && req.session.user) || null,
      banners: [],
      products: [],
      discountProducts: [],
    });
  }
};

// 상품 상세 페이지 컨트롤러
exports.getProductDetailPage = async (req, res) => {
  const { id } = req.query; // URL 파라미터 (?id=P...)

  try {
    if (!id) {
      return res.status(404).send("잘못된 접근입니다.");
    }

    // [수정] 로그인한 유저라면 userCode를 추출하여 찜 여부 확인
    const currentUser = req.user || (req.session && req.session.user) || null;
    const userCode = currentUser
      ? currentUser.code || currentUser.USER_CODE || currentUser.id
      : null;

    // [수정] getProductDetail에 userCode 전달
    const product = await productModel.getProductDetail(id, userCode);

    if (!product) {
      return res.status(404).send("상품을 찾을 수 없습니다.");
    }

    res.render("product/detail", {
      user: currentUser,
      product: product,
      pageTitle: product.name,
    });
  } catch (err) {
    console.error("Product detail error:", err);
    res.status(500).send("상품 정보를 불러오는 중 오류가 발생했습니다.");
  }
};

// 상품 목록 및 검색 페이지 컨트롤러
exports.getProductsPage = async (req, res) => {
  const { category, device, q } = req.query;
  let products = [];
  let pageTitle = "전체 상품";
  let discountTitle = "지금 할인 중인 상품";
  let filterType = "";
  let filterValue = "";

  try {
    if (category) {
      filterType = "category";
      filterValue = category;
      const categoryName = await productModel.getNameByCode(
        "category",
        category
      );
      pageTitle = `'${categoryName}' 카테고리의 상품`;
      discountTitle = `지금 할인 중인 '${categoryName}' 카테고리 상품`;
      products = await productModel.getProductsByFilter("category", category);
    } else if (device) {
      filterType = "device";
      filterValue = device;
      const deviceName = await productModel.getNameByCode("device", device);
      pageTitle = `'${deviceName}' 기기의 상품`;
      discountTitle = `지금 할인 중인 '${deviceName}' 기기 상품`;
      products = await productModel.getProductsByFilter("device", device);
    } else if (q) {
      filterType = "search";
      filterValue = q;
      pageTitle = `'${q}'의 검색결과 상품`;
      discountTitle = `지금 할인 중인 '${q}'가 포함된 상품`;
      products = await productModel.getProductsByFilter("search", q);
    } else {
      products = await productModel.getMainProductList();
    }

    const discountProducts = products
      .filter((p) => p.salePrice !== null)
      .sort((a, b) => b.discountRate - a.discountRate);

    const currentUser = req.user || (req.session && req.session.user) || null;

    return res.render("products", {
      user: currentUser,
      products: products,
      discountProducts: discountProducts,
      pageTitle: pageTitle,
      discountTitle: discountTitle,
    });
  } catch (err) {
    console.error("Product search error:", err);
    return res.render("products", {
      user: req.user || (req.session && req.session.user) || null,
      products: [],
      discountProducts: [],
      pageTitle: "상품 목록을 불러올 수 없습니다.",
      discountTitle: "",
    });
  }
};

const productModel = require("../models/productModel");
const userModel = require("../models/userModel");
const discountModel = require("../models/discountModel");
const reviewModel = require("../models/reviewModel");

// [통합 수정] 상품 상세 페이지 렌더링
exports.renderDetail = async (req, res) => {
  const { id } = req.query; // 라우터 설정에 따라 req.params.id 일 수도 있음 (확인 필요)

  if (!id) {
    return res
      .status(404)
      .send("<script>alert('잘못된 접근입니다.'); history.back();</script>");
  }

  try {
    const currentUser = req.user || (req.session && req.session.user) || null;
    const userCode = currentUser
      ? currentUser.code || currentUser.USER_CODE || currentUser.id
      : null;

    // 1. 상품 기본 정보 조회
    const product = await productModel.getProductDetail(id, userCode);

    if (!product) {
      return res
        .status(404)
        .send(
          "<script>alert('상품을 찾을 수 없습니다.'); history.back();</script>"
        );
    }

    // 2. [추가됨] 해당 상품의 리뷰 목록 조회
    const reviews = await reviewModel.getProductReviews(id);
    product.reviews = reviews; // product 객체에 리뷰 데이터 병합

    // 3. 찜 여부 확인 (로그인 시) - userModel에 해당 함수가 있다면 주석 해제
    let isWished = false;
    if (userCode) {
      // isWished = await userModel.checkWishlist(userCode, id);
    }
    product.isWished = isWished;

    res.render("product/detail", {
      user: currentUser,
      product: product,
    });
  } catch (err) {
    console.error("Detail page error:", err);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
};

// 할인 기록 페이지 렌더링 (기존 유지)
exports.renderDiscountHistory = async (req, res) => {
  const { id } = req.query;

  try {
    if (!id)
      return res
        .status(404)
        .send("<script>alert('잘못된 접근입니다.'); history.back();</script>");

    const product = await productModel.getProductDetail(id);
    if (!product)
      return res
        .status(404)
        .send(
          "<script>alert('상품을 찾을 수 없습니다.'); history.back();</script>"
        );

    const rawHistory = await discountModel.getDiscountHistory(id);
    const allRecords = [];

    const history = rawHistory.map((h) => {
      const base = h.ORIGINAL_PRICE;
      let discounted = 0;
      let rate = 0;

      if (h.DISCOUNT_PRICE) {
        discounted = h.DISCOUNT_PRICE;
        rate = Math.round(((base - discounted) / base) * 100);
      } else {
        rate = h.DISCOUNT_RATE;
        discounted = Math.floor(base * (1 - rate / 100));
      }

      allRecords.push({ rate: rate, price: discounted });

      return {
        date: `${h.START_DATE} ~ ${h.END_DATE}`,
        rate: rate,
        priceFrom: base.toLocaleString() + "원",
        priceTo: discounted.toLocaleString() + "원",
      };
    });

    if (product.salePrice) {
      allRecords.push({ rate: product.discountRate, price: product.salePrice });
    }

    let maxInfo = { rate: 0, price: product.price };
    let minInfo = { rate: 0, price: product.price };

    if (allRecords.length > 0) {
      allRecords.sort((a, b) => b.rate - a.rate);
      maxInfo = allRecords[0];
      minInfo = allRecords[allRecords.length - 1];
    }

    const currentUser = req.user || (req.session && req.session.user) || null;

    res.render("product/discount-history", {
      user: currentUser,
      product: {
        code: product.code,
        name: product.name,
        image:
          product.gallery && product.gallery.length > 0
            ? product.gallery[0]
            : null,
        devices: product.devices,
        categories: product.categories,
        originalPrice: product.price.toLocaleString(),
        nowPrice: (product.salePrice || product.price).toLocaleString(),
        isDiscounted: !!product.salePrice,
        currentRate: product.discountRate,
        maxRate: maxInfo.rate,
        maxPrice: maxInfo.price.toLocaleString(),
        minRate: minInfo.rate,
        minPrice: minInfo.price.toLocaleString(),
      },
      history: history,
    });
  } catch (err) {
    console.error("Discount history error:", err);
    res.status(500).send("서버 오류가 발생했습니다.");
  }
};

// 검색 API (기존 유지)
exports.searchApi = async (req, res) => {
  const query = req.query.q || "";
  try {
    if (query.length < 1) return res.json({ success: true, products: [] });
    const products = await productModel.searchProductsPublic(query);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 찜하기 토글 API (기존 유지)
exports.toggleWishlist = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser)
    return res
      .status(401)
      .json({ success: false, message: "로그인 필요", needLogin: true });

  const { productCode } = req.body;
  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;
  try {
    const result = await userModel.toggleWishlist(userCode, productCode);
    res.json({ success: true, action: result.action });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error" });
  }
};

// 실시간 재고 조회 API (기존 유지)
exports.getProductStockApi = async (req, res) => {
  const { id } = req.query;
  try {
    const stock = await productModel.getProductStock(id);
    res.json({ success: true, stock: stock });
  } catch (err) {
    console.error("Get Stock Error:", err);
    res.status(500).json({ success: false, message: "Error fetching stock" });
  }
};

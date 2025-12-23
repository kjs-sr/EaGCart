const productModel = require("../../models/productModel");
const scheduler = require("../../utils/scheduler"); // [신규] 스케줄러 추가

// 1. 상품 목록 페이지
exports.listProducts = async (req, res) => {
  try {
    const products = await productModel.getProductList();
    res.render("admin/products", {
      active: "products",
      admin: { productTable: products },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("상품 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// 2. 상품 등록 페이지 렌더링
exports.renderCreatePage = async (req, res) => {
  try {
    const devices = await productModel.getDevices();
    const categories = await productModel.getCategories();

    res.render("admin/product-create", {
      active: "product-create",
      options: { devices, categories },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("페이지 로딩 오류");
  }
};

// 상품 등록
exports.createProduct = async (req, res) => {
  try {
    const { name, price, originalPrice, description, devices, categories } =
      req.body;
    const files = req.files;
    const deviceList = Array.isArray(devices)
      ? devices
      : devices
      ? [devices]
      : [];
    const categoryList = Array.isArray(categories)
      ? categories
      : categories
      ? [categories]
      : [];

    const productData = {
      name,
      price,
      originalPrice: originalPrice || price,
      description,
      devices: deviceList,
      categories: categoryList,
    };

    await productModel.createProduct(productData, files);
    res.send(
      "<script>alert('상품이 등록되었습니다.'); location.href='/admin/products';</script>"
    );
  } catch (err) {
    console.error("Product Create Error:", err);
    res
      .status(500)
      .send("<script>alert('상품 등록 실패'); history.back();</script>");
  }
};

// 태그 관련 API (생략 - 기존 코드 유지)
exports.getTags = async (req, res) => {
  /* ... */
};
exports.addTag = async (req, res) => {
  /* ... */
};
exports.updateTag = async (req, res) => {
  /* ... */
};
exports.deleteTag = async (req, res) => {
  /* ... */
};

// 상품 수정 페이지 렌더링
exports.renderEditPage = async (req, res) => {
  try {
    const productCode = req.params.id;
    const product = await productModel.getProductByCode(productCode);
    if (!product) return res.status(404).send("상품을 찾을 수 없습니다.");
    const devices = await productModel.getDevices();
    const categories = await productModel.getCategories();

    res.render("admin/product-edit", {
      active: "products",
      product: product,
      options: { devices, categories },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("오류 발생");
  }
};

// [수정됨] 상품 수정 (재입고 알림 로직 추가)
exports.updateProduct = async (req, res) => {
  try {
    const productCode = req.params.id;
    const {
      name,
      price,
      originalPrice,
      description,
      status,
      devices,
      categories,
      imageOrder,
    } = req.body;
    const newFiles = req.files;

    // [신규] 수정 전 상태 조회를 위해 현재 상품 정보 가져오기
    const oldProduct = await productModel.getProductByCode(productCode);
    const wasSoldOut = oldProduct && oldProduct.STATUS === "품절";

    const deviceList = Array.isArray(devices)
      ? devices
      : devices
      ? [devices]
      : [];
    const categoryList = Array.isArray(categories)
      ? categories
      : categories
      ? [categories]
      : [];

    const productData = {
      name,
      price,
      originalPrice: originalPrice || price,
      description,
      status,
      devices: deviceList,
      categories: categoryList,
      imageOrder,
    };

    await productModel.updateProduct(productCode, productData, newFiles);

    // [신규] 상태 변경 감지: 품절 -> 판매중 이면 재입고 알림 발송
    if (wasSoldOut && status === "판매중") {
      scheduler.sendRestockAlert(productCode).catch(console.error);
    }

    res.send(
      "<script>alert('상품 정보가 수정되었습니다.'); location.href='/admin/products';</script>"
    );
  } catch (err) {
    console.error("Product Update Error:", err);
    res
      .status(500)
      .send("<script>alert('상품 수정 실패'); history.back();</script>");
  }
};

// 상품 검색 API
exports.searchProductApi = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, products: [] });
  try {
    const products = await productModel.searchProducts(q);
    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "검색 오류" });
  }
};

const userModel = require("../models/userModel");

// 장바구니 페이지 렌더링
exports.renderCart = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res.redirect("/login");
  }

  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  try {
    const items = await userModel.getCartItems(userCode);

    // 초기 총 가격 계산 (할인가 우선 적용)
    const total = items.reduce((sum, item) => {
      const price = item.salePrice || item.price;
      return sum + price * item.qty;
    }, 0);

    res.render("cart/index", {
      user: currentUser,
      cart: {
        items: items,
        summary: { total: total.toLocaleString() },
      },
    });
  } catch (err) {
    console.error("Render Cart Error:", err);
    res.status(500).send("장바구니를 불러오는 중 오류가 발생했습니다.");
  }
};

// 장바구니 추가
exports.addToCart = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res.status(401).json({
      success: false,
      message: "로그인이 필요합니다.",
      needLogin: true,
    });
  }

  const { productCode, qty } = req.body;
  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;
  const count = parseInt(qty) || 1;

  try {
    await userModel.addToCart(userCode, productCode, count);
    res.json({ success: true, message: "장바구니에 추가되었습니다." });
  } catch (err) {
    console.error("Add to Cart Error:", err);
    res.status(500).json({ success: false, message: "실패했습니다." });
  }
};

// 수량 변경
exports.updateCartQty = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser)
    return res.status(401).json({ success: false, message: "로그인 필요" });

  const { productCode, qty } = req.body;
  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  if (qty < 1)
    return res
      .status(400)
      .json({ success: false, message: "최소 수량은 1개입니다." });

  try {
    await userModel.updateCartQty(userCode, productCode, parseInt(qty));
    res.json({ success: true });
  } catch (err) {
    console.error("Update Cart Error:", err);
    res.status(500).json({ success: false, message: "수량 변경 실패" });
  }
};

// 삭제
exports.deleteCartItem = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser)
    return res.status(401).json({ success: false, message: "로그인 필요" });

  const { productCode } = req.body;
  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  try {
    await userModel.deleteCartItem(userCode, productCode);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete Cart Error:", err);
    res.status(500).json({ success: false, message: "삭제 실패" });
  }
};

// [신규] 장바구니 개수 조회 API (헤더용)
exports.getCartCountApi = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) return res.json({ success: true, count: 0 });

  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;
  try {
    const count = await userModel.getCartCount(userCode);
    res.json({ success: true, count: count });
  } catch (err) {
    console.error("Cart Count Error:", err);
    res.json({ success: false, count: 0 });
  }
};

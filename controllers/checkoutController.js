const userModel = require("../models/userModel");
const productModel = require("../models/productModel");

// 결제 페이지 렌더링 (기존 유지)
exports.renderCheckout = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) {
    return res.send(
      "<script>alert('로그인이 필요한 서비스입니다.'); location.href='/login';</script>"
    );
  }

  const { id, qty, items } = req.query;
  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  let orderItems = [];
  let totalPrice = 0;
  let totalDiscount = 0;

  try {
    if (id && qty) {
      // 바로구매 로직
      const product = await productModel.getProductDetail(id);
      if (!product)
        return res.send("<script>alert('상품 오류'); history.back();</script>");

      const quantity = parseInt(qty);
      const originalPrice = product.price;
      const salePrice = product.salePrice || originalPrice;
      const itemDiscount = (originalPrice - salePrice) * quantity;

      orderItems.push({
        code: product.code,
        name: product.name,
        qty: quantity,
        price: originalPrice,
        salePrice: salePrice,
        totalPrice: salePrice * quantity,
        thumbnail: product.gallery?.[0],
        console: product.devices || "기타",
      });
      totalPrice = originalPrice * quantity;
      totalDiscount = itemDiscount;
    } else {
      // 장바구니 구매 로직
      let cartItems = await userModel.getCartItems(userCode);
      if (items) {
        const selectedCodes = items.split(",");
        cartItems = cartItems.filter((item) =>
          selectedCodes.includes(item.code)
        );
      }

      if (!cartItems || cartItems.length === 0) {
        return res.send(
          "<script>alert('구매할 상품이 없습니다.'); history.back();</script>"
        );
      }

      cartItems.forEach((item) => {
        const originalPrice = item.price;
        const salePrice = item.salePrice || originalPrice;
        const itemDiscount = (originalPrice - salePrice) * item.qty;

        orderItems.push({
          code: item.code,
          name: item.name,
          qty: item.qty,
          price: originalPrice,
          salePrice: salePrice,
          totalPrice: salePrice * item.qty,
          thumbnail: item.thumbnail,
          console: item.console,
        });
        totalPrice += originalPrice * item.qty;
        totalDiscount += itemDiscount;
      });
    }

    const userInfo = await userModel.findUserById(currentUser.id);
    const coupons = await userModel.getUsableCoupons(userCode);
    const finalPrice = totalPrice - totalDiscount;

    res.render("checkout/index", {
      user: currentUser,
      userInfo: userInfo,
      items: orderItems,
      coupons: coupons,
      summary: {
        totalPrice: totalPrice,
        totalDiscount: totalDiscount,
        finalPrice: finalPrice,
      },
      fromCart: !id,
    });
  } catch (err) {
    console.error("Render Checkout Error:", err);
    res.status(500).send("오류 발생");
  }
};

// [수정됨] 최근 배송지 정보 불러오기 API
exports.getRecentAddress = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser) return res.status(401).json({ success: false });

  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;

  try {
    const recentOrder = await userModel.getRecentOrder(userCode);

    if (recentOrder) {
      // DB에 저장된 SHIPPING_ADDRESS 형식: "기본주소|상세주소|받는사람"
      const rawAddress = recentOrder.SHIPPING_ADDRESS || "";
      const parts = rawAddress.split("|"); // 구분자 '|'로 분리

      // 데이터 파싱 (데이터가 없을 경우 빈 문자열)
      const baseAddress = parts[0] || "";
      const detailAddress = parts[1] || "";
      const receiverName = parts[2] || ""; // 인덱스 2에 받는사람 저장됨

      res.json({
        success: true,
        address: baseAddress,
        addressDetail: detailAddress,
        receiverName: receiverName,
        phone: recentOrder.PHONE_NUMBER,
        request: recentOrder.DELIVERY_REQUEST,
      });
    } else {
      res.json({ success: false, message: "최근 주문 내역이 없습니다." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
};

// [수정됨] 결제 및 주문 처리 API
exports.processPayment = async (req, res) => {
  const currentUser = req.user || (req.session && req.session.user);
  if (!currentUser)
    return res.status(401).json({ success: false, message: "로그인 필요" });

  const userCode = currentUser.code || currentUser.USER_CODE || currentUser.id;
  const {
    receiverName,
    receiverPhone,
    address,
    addressDetail,
    request,
    items,
    couponCode,
    finalAmount,
    fromCart,
  } = req.body;

  if (!receiverName || !receiverPhone || !address) {
    return res
      .status(400)
      .json({ success: false, message: "배송 정보를 모두 입력해주세요." });
  }

  // [핵심] 주소 데이터 병합 (구분자 '|' 사용)
  // 형식: 기본주소|상세주소|받는사람
  const combinedAddress = `${address}|${addressDetail}|${receiverName}`;

  try {
    const orderData = {
      userCode,
      phone: receiverPhone,
      address: combinedAddress, // 병합된 문자열 저장
      request: request,
      items: items,
      totalPrice: finalAmount,
      couponCode: couponCode || null,
      fromCart: fromCart,
    };

    const orderId = await userModel.createOrder(orderData);

    res.json({
      success: true,
      message: "주문이 완료되었습니다.",
      orderId: orderId,
    });
  } catch (err) {
    console.error("Payment Process Error:", err);
    res
      .status(500)
      .json({ success: false, message: "주문 처리 중 오류가 발생했습니다." });
  }
};

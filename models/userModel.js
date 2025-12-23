const db = require("../config/db");
const oracledb = require("oracledb");
// [신규] 스케줄러 유틸리티 불러오기
const scheduler = require("../utils/scheduler");

async function findUserById(userId) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT * FROM EaGCart_Members WHERE USER_ID = :userId`,
      { userId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

async function findUserByEmail(email) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT * FROM EaGCart_Members WHERE EMAIL = :email`,
      { email },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

async function findUserByNickname(nickname) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT * FROM EaGCart_Members WHERE USER_NAME = :nickname`,
      { nickname },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

async function createUser(userData) {
  let connection;
  try {
    connection = await db.getConnection();
    const userCode = "U" + Date.now().toString();

    const sql = `
      INSERT INTO EaGCart_Members (
        USER_CODE, USER_ID, USER_PASSWORD, USER_NAME, EMAIL, REGISTRATION_DATE, STATUS
      ) VALUES (
        :userCode, :userId, :password, :userName, :email, SYSDATE, 'ACTIVE'
      )
    `;

    await connection.execute(
      sql,
      {
        userCode: userCode,
        userId: userData.userId,
        password: userData.password,
        userName: userData.nickname,
        email: userData.email,
      },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error("Create User Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

async function updatePassword(userId, newHashedPassword) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `UPDATE EaGCart_Members SET USER_PASSWORD = :pw WHERE USER_ID = :id`,
      { pw: newHashedPassword, id: userId },
      { autoCommit: true }
    );
  } finally {
    if (connection) await connection.close();
  }
}

async function updateUser(userId, updateData) {
  let connection;
  try {
    connection = await db.getConnection();
    let sql = `UPDATE EaGCart_Members SET USER_NAME = :nickname, EMAIL = :email`;
    const binds = {
      nickname: updateData.nickname,
      email: updateData.email,
      id: userId,
    };
    if (updateData.password) {
      sql += `, USER_PASSWORD = :password`;
      binds.password = updateData.password;
    }
    sql += ` WHERE USER_ID = :id`;
    await connection.execute(sql, binds, { autoCommit: true });
    return true;
  } catch (err) {
    console.error("Update User Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

async function withdrawUser(userId) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `UPDATE EaGCart_Members SET STATUS = 'WITHDRAWN' WHERE USER_ID = :id`,
      { id: userId },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error("Withdraw User Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

async function getUserList() {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `SELECT USER_CODE, USER_ID, USER_NAME, EMAIL, TO_CHAR(REGISTRATION_DATE, 'YYYY-MM-DD') AS REG_DATE, STATUS, BAN_REASON FROM EaGCart_Members ORDER BY REGISTRATION_DATE DESC`;
    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return result.rows.map((row) => ({
      code: row.USER_CODE,
      id: row.USER_ID,
      nickname: row.USER_NAME,
      email: row.EMAIL,
      regDate: row.REG_DATE,
      status: row.STATUS,
      banReason: row.BAN_REASON || "",
    }));
  } finally {
    if (connection) await connection.close();
  }
}

async function updateUserStatus(userId, status, banReason) {
  let connection;
  try {
    connection = await db.getConnection();
    const reasonVal = status === "BANNED" ? banReason : null;
    await connection.execute(
      `UPDATE EaGCart_Members SET STATUS = :status, BAN_REASON = :reason WHERE USER_ID = :id`,
      { status: status, reason: reasonVal, id: userId },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error("Update Status Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

async function toggleWishlist(userCode, productCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const checkSql = `SELECT 1 FROM EaGCart_Wishlists WHERE USER_CODE = :userCode AND PRODUCT_CODE = :productCode`;
    const checkResult = await connection.execute(checkSql, {
      userCode,
      productCode,
    });

    if (checkResult.rows.length > 0) {
      await connection.execute(
        `DELETE FROM EaGCart_Wishlists WHERE USER_CODE = :userCode AND PRODUCT_CODE = :productCode`,
        { userCode, productCode },
        { autoCommit: true }
      );
      return { action: "removed" };
    } else {
      await connection.execute(
        `INSERT INTO EaGCart_Wishlists (USER_CODE, PRODUCT_CODE) VALUES (:userCode, :productCode)`,
        { userCode, productCode },
        { autoCommit: true }
      );
      return { action: "added" };
    }
  } finally {
    if (connection) await connection.close();
  }
}

async function addToCart(userCode, productCode, count) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      MERGE INTO EaGCart_Carts C
      USING DUAL ON (C.USER_CODE = :userCode AND C.PRODUCT_CODE = :productCode)
      WHEN MATCHED THEN
        UPDATE SET C.COUNT = C.COUNT + :count
      WHEN NOT MATCHED THEN
        INSERT (USER_CODE, PRODUCT_CODE, COUNT) VALUES (:userCode, :productCode, :count)
    `;
    await connection.execute(
      sql,
      { userCode, productCode, count },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

async function getCartItems(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        C.PRODUCT_CODE, 
        C.COUNT, 
        P.PRODUCT_NAME, 
        P.SELLING_PRICE, 
        P.CURRENT_STOCK, 
        D.DISCOUNT_RATE, 
        D.DISCOUNT_PRICE, 
        (SELECT LISTAGG(D.DEVICE_NAME, ', ') WITHIN GROUP (ORDER BY D.DEVICE_NAME) 
         FROM EaGCart_Product_Devices PD 
         JOIN EaGCart_Devices D ON PD.DEVICE_CODE = D.DEVICE_CODE 
         WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE) AS CONSOLE, 
        (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL 
      FROM EaGCart_Carts C 
      JOIN EaGCart_Products P ON C.PRODUCT_CODE = P.PRODUCT_CODE 
      LEFT JOIN ( 
          SELECT PRODUCT_CODE, DISCOUNT_RATE, DISCOUNT_PRICE 
          FROM ( 
              SELECT 
                  PRODUCT_CODE, 
                  DISCOUNT_RATE, 
                  DISCOUNT_PRICE, 
                  ROW_NUMBER() OVER (PARTITION BY PRODUCT_CODE ORDER BY START_DATE DESC) as RN 
              FROM EaGCart_Discounts 
              WHERE STATUS = '진행중' 
                AND TRUNC(SYSDATE) BETWEEN TRUNC(START_DATE) AND TRUNC(END_DATE) 
          ) 
          WHERE RN = 1 
      ) D ON P.PRODUCT_CODE = D.PRODUCT_CODE 
      WHERE C.USER_CODE = :userCode 
      ORDER BY P.PRODUCT_NAME ASC
    `;
    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => {
      let salePrice = null;
      if (row.DISCOUNT_PRICE) {
        salePrice = row.DISCOUNT_PRICE;
      } else if (row.DISCOUNT_RATE) {
        salePrice = Math.floor(
          row.SELLING_PRICE * (1 - row.DISCOUNT_RATE / 100)
        );
      }

      return {
        code: row.PRODUCT_CODE,
        name: row.PRODUCT_NAME,
        price: row.SELLING_PRICE,
        salePrice: salePrice,
        qty: row.COUNT,
        stock: row.CURRENT_STOCK,
        console: row.CONSOLE || "기타",
        thumbnail: row.THUMBNAIL,
        selected: true,
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

async function getCartCount(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `SELECT COUNT(*) AS CNT FROM EaGCart_Carts WHERE USER_CODE = :userCode`;
    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0].CNT;
  } finally {
    if (connection) await connection.close();
  }
}

async function updateCartQty(userCode, productCode, newQty) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `UPDATE EaGCart_Carts SET COUNT = :qty WHERE USER_CODE = :userCode AND PRODUCT_CODE = :productCode`,
      { qty: newQty, userCode, productCode },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

async function deleteCartItem(userCode, productCode) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `DELETE FROM EaGCart_Carts WHERE USER_CODE = :userCode AND PRODUCT_CODE = :productCode`,
      { userCode, productCode },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

async function getWishlistItems(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        P.PRODUCT_CODE, 
        P.PRODUCT_NAME, 
        P.SELLING_PRICE, 
        D.DISCOUNT_RATE, 
        D.DISCOUNT_PRICE, 
        (SELECT LISTAGG(DEV.DEVICE_NAME, ', ') WITHIN GROUP (ORDER BY DEV.DEVICE_NAME)
         FROM EaGCart_Product_Devices PD 
         JOIN EaGCart_Devices DEV ON PD.DEVICE_CODE = DEV.DEVICE_CODE 
         WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE) AS CONSOLE,
        (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL
      FROM EaGCart_Wishlists W
      JOIN EaGCart_Products P ON W.PRODUCT_CODE = P.PRODUCT_CODE
      LEFT JOIN (
          SELECT PRODUCT_CODE, DISCOUNT_RATE, DISCOUNT_PRICE
          FROM (
              SELECT 
                  PRODUCT_CODE, 
                  DISCOUNT_RATE, 
                  DISCOUNT_PRICE, 
                  ROW_NUMBER() OVER (PARTITION BY PRODUCT_CODE ORDER BY START_DATE DESC) as RN
              FROM EaGCart_Discounts
              WHERE STATUS = '진행중' 
                AND TRUNC(SYSDATE) BETWEEN TRUNC(START_DATE) AND TRUNC(END_DATE)
          )
          WHERE RN = 1
      ) D ON P.PRODUCT_CODE = D.PRODUCT_CODE
      WHERE W.USER_CODE = :userCode
      ORDER BY P.PRODUCT_NAME ASC
    `;

    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => {
      let salePrice = null;
      if (row.DISCOUNT_PRICE) {
        salePrice = row.DISCOUNT_PRICE;
      } else if (row.DISCOUNT_RATE) {
        salePrice = Math.floor(
          row.SELLING_PRICE * (1 - row.DISCOUNT_RATE / 100)
        );
      }

      return {
        code: row.PRODUCT_CODE,
        name: row.PRODUCT_NAME,
        price: row.SELLING_PRICE,
        salePrice: salePrice,
        discountRate: row.DISCOUNT_RATE,
        console: row.CONSOLE || "기타",
        thumbnail: row.THUMBNAIL,
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// [수정] 보유 쿠폰 목록 조회 (미사용 쿠폰만 조회)
async function getUserCoupons(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        C.COUPON_NAME, 
        C.DISCOUNT_RATE, 
        C.DISCOUNT_AMOUNT, 
        C.MAX_DISCOUNT_AMOUNT,
        UC.STATUS AS USAGE_STATUS, 
        TO_CHAR(C.START_DATE, 'YYYY-MM-DD') AS START_DATE, 
        TO_CHAR(C.END_DATE, 'YYYY-MM-DD') AS END_DATE, 
        CEIL(C.END_DATE - SYSDATE) AS REMAINING_DAYS
      FROM EaGCart_User_Coupons UC
      JOIN EaGCart_Coupons C ON UC.COUPON_CODE = C.COUPON_CODE
      WHERE UC.USER_CODE = :userCode
        AND UC.STATUS = 'UNUSED'  -- [추가] 사용하지 않은 쿠폰만 필터링
      ORDER BY C.END_DATE ASC
    `;

    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      title: row.COUPON_NAME,
      type: row.DISCOUNT_RATE ? "RATE" : "AMOUNT",
      value: row.DISCOUNT_RATE
        ? row.DISCOUNT_RATE + "%"
        : row.DISCOUNT_AMOUNT.toLocaleString() + "원",
      limit: row.MAX_DISCOUNT_AMOUNT,
      status: row.USAGE_STATUS,
      startDate: row.START_DATE,
      endDate: row.END_DATE,
      remaining: row.REMAINING_DAYS,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

async function getRecentOrder(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT * FROM (
        SELECT PHONE_NUMBER, SHIPPING_ADDRESS, DELIVERY_REQUEST
        FROM EaGCart_Orders
        WHERE USER_CODE = :userCode
        ORDER BY ORDER_DATE DESC
      ) WHERE ROWNUM = 1
    `;
    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

async function getUsableCoupons(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        C.COUPON_CODE, C.COUPON_NAME, C.DISCOUNT_RATE, C.DISCOUNT_AMOUNT, C.MAX_DISCOUNT_AMOUNT
      FROM EaGCart_User_Coupons UC
      JOIN EaGCart_Coupons C ON UC.COUPON_CODE = C.COUPON_CODE
      WHERE UC.USER_CODE = :userCode
        AND UC.STATUS = 'UNUSED'
        AND TRUNC(SYSDATE) BETWEEN TRUNC(C.START_DATE) AND TRUNC(C.END_DATE)
      ORDER BY C.DISCOUNT_RATE DESC, C.DISCOUNT_AMOUNT DESC
    `;
    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      code: row.COUPON_CODE,
      name: row.COUPON_NAME,
      rate: row.DISCOUNT_RATE,
      amount: row.DISCOUNT_AMOUNT,
      maxAmount: row.MAX_DISCOUNT_AMOUNT,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

async function createOrder(orderData) {
  let connection;
  try {
    connection = await db.getConnection();

    const orderCode = "ORD" + Date.now() + Math.floor(Math.random() * 1000);

    const orderSql = `
      INSERT INTO EaGCart_Orders (
        ORDER_CODE, USER_CODE, ORDER_DATE, PAYMENT_AMOUNT, 
        PHONE_NUMBER, SHIPPING_ADDRESS, DELIVERY_REQUEST, 
        DELIVERY_DATE, DELIVERY_STATUS
      ) VALUES (
        :oCode, :uCode, SYSDATE, :amount, 
        :phone, :addr, :req, 
        CASE 
          WHEN TO_CHAR(SYSDATE, 'DY', 'NLS_DATE_LANGUAGE=AMERICAN') IN ('FRI', 'SAT', 'SUN') THEN SYSDATE + 5
          ELSE SYSDATE + 3
        END, 
        'PAYMENT_COMPLETED' 
      )
    `;

    await connection.execute(
      orderSql,
      {
        oCode: orderCode,
        uCode: orderData.userCode,
        amount: orderData.totalPrice,
        phone: orderData.phone,
        addr: orderData.address,
        req: orderData.request,
      },
      { autoCommit: false }
    );

    const itemSql = `
      INSERT INTO EaGCart_Order_Items (
        ORDER_CODE, PRODUCT_CODE, ITEM_PRICE, COUNT, STATUS
      ) VALUES (
        :oCode, :pCode, :price, :qty, 'PAYMENT_COMPLETED'
      )
    `;

    const stockUpdateSql = `
      UPDATE EaGCart_Products 
      SET CURRENT_STOCK = CURRENT_STOCK - :qty 
      WHERE PRODUCT_CODE = :pCode
    `;

    // 주문된 상품 코드 수집
    const orderedProductCodes = [];

    for (const item of orderData.items) {
      await connection.execute(
        itemSql,
        {
          oCode: orderCode,
          pCode: item.code,
          price: item.price,
          qty: item.qty,
        },
        { autoCommit: false }
      );

      await connection.execute(
        stockUpdateSql,
        {
          qty: item.qty,
          pCode: item.code,
        },
        { autoCommit: false }
      );

      orderedProductCodes.push(item.code);
    }

    if (orderData.couponCode) {
      const couponSql = `
        UPDATE EaGCart_User_Coupons 
        SET STATUS = 'USED' 
        WHERE USER_CODE = :uCode AND COUPON_CODE = :cCode
      `;
      await connection.execute(
        couponSql,
        {
          uCode: orderData.userCode,
          cCode: orderData.couponCode,
        },
        { autoCommit: false }
      );
    }

    if (orderData.fromCart) {
      for (const item of orderData.items) {
        await connection.execute(
          `DELETE FROM EaGCart_Carts WHERE USER_CODE = :uCode AND PRODUCT_CODE = :pCode`,
          { uCode: orderData.userCode, pCode: item.code },
          { autoCommit: false }
        );
      }
    }

    await connection.commit();

    // [신규] 주문 완료 후 재고 부족 체크 및 관리자 알림
    scheduler.checkLowStock(orderedProductCodes).catch(console.error);

    return orderCode;
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Order Creation Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

async function getUserOrders(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        O.ORDER_CODE,
        TO_CHAR(O.ORDER_DATE, 'YYYY.MM.DD') AS ORDER_DATE,
        TO_CHAR(O.DELIVERY_DATE, 'YYYY.MM.DD') AS DELIVERY_DATE,
        O.DELIVERY_STATUS,
        O.PAYMENT_AMOUNT,
        (SELECT COUNT(*) FROM EaGCart_Order_Items WHERE ORDER_CODE = O.ORDER_CODE) AS ITEM_COUNT,
        (SELECT P.PRODUCT_NAME 
         FROM EaGCart_Order_Items OI 
         JOIN EaGCart_Products P ON OI.PRODUCT_CODE = P.PRODUCT_CODE 
         WHERE OI.ORDER_CODE = O.ORDER_CODE AND ROWNUM = 1) AS REP_NAME,
        (SELECT PI.IMAGE_PATH 
         FROM EaGCart_Order_Items OI 
         JOIN EaGCart_Product_Images PI ON OI.PRODUCT_CODE = PI.PRODUCT_CODE 
         WHERE OI.ORDER_CODE = O.ORDER_CODE AND PI.IMAGE_SEQUENCE = 1 AND ROWNUM = 1) AS REP_IMAGE
      FROM EaGCart_Orders O
      WHERE O.USER_CODE = :userCode
      ORDER BY O.ORDER_DATE DESC
    `;

    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => {
      let name = row.REP_NAME;
      if (row.ITEM_COUNT > 1) {
        name += ` 외 ${row.ITEM_COUNT - 1}개`;
      }

      let status = "결제 완료";
      if (row.DELIVERY_STATUS === "PAYMENT_COMPLETED") status = "결제 완료";
      else if (row.DELIVERY_STATUS === "SHIPPING") status = "배송 중";
      else if (row.DELIVERY_STATUS === "DELIVERED") status = "배송 완료";
      else if (row.DELIVERY_STATUS === "CANCELLED") status = "주문 취소";

      let eta = row.DELIVERY_DATE || "배송 일정 미정";
      if (row.DELIVERY_STATUS === "CANCELLED") {
        eta = "-";
      }

      return {
        id: row.ORDER_CODE,
        date: row.ORDER_DATE,
        status: status,
        name: name,
        price: row.PAYMENT_AMOUNT.toLocaleString(),
        qty: row.ITEM_COUNT,
        cover: row.REP_IMAGE,
        eta: eta,
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

async function getOrderItems(orderCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        P.PRODUCT_CODE,
        P.PRODUCT_NAME,
        OI.ITEM_PRICE,
        OI.COUNT,
        OI.STATUS,
        (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI 
         WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1 AND ROWNUM = 1) AS THUMBNAIL,
        (SELECT COUNT(*) FROM EaGCart_Reviews R
         WHERE R.PRODUCT_CODE = P.PRODUCT_CODE
           AND R.USER_CODE = (SELECT USER_CODE FROM EaGCart_Orders WHERE ORDER_CODE = :code)
           AND R.STATUS != 'DELETED') AS HAS_REVIEW
      FROM EaGCart_Order_Items OI
      JOIN EaGCart_Products P ON OI.PRODUCT_CODE = P.PRODUCT_CODE
      WHERE OI.ORDER_CODE = :code
    `;
    const result = await connection.execute(
      sql,
      { code: orderCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      code: row.PRODUCT_CODE,
      name: row.PRODUCT_NAME,
      price: row.ITEM_PRICE,
      qty: row.COUNT,
      status: row.STATUS,
      image: row.THUMBNAIL,
      hasReview: row.HAS_REVIEW > 0, // 불리언 값으로 변환
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// [수정] 주문 취소 시 재고 복구 로직 추가
async function cancelOrder(orderCode, userCode) {
  let connection;
  try {
    connection = await db.getConnection();

    // 1. 취소할 주문의 상품 목록 조회 (재고 복구를 위해)
    // 취소 가능한 상태인지 확인 (이미 배송중/완료된 건은 취소 불가 처리 필요 시 여기에 조건 추가)
    const itemsSql = `
      SELECT PRODUCT_CODE, COUNT 
      FROM EaGCart_Order_Items 
      WHERE ORDER_CODE = :code
    `;
    const itemsResult = await connection.execute(
      itemsSql,
      { code: orderCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const orderItems = itemsResult.rows;

    if (orderItems.length === 0) {
      throw new Error("주문 상품 정보를 찾을 수 없습니다.");
    }

    // 2. 주문 상태 업데이트 (취소 처리)
    const orderUpdateSql = `
      UPDATE EaGCart_Orders
      SET DELIVERY_STATUS = 'CANCELLED',
          DELIVERY_DATE = NULL
      WHERE ORDER_CODE = :code AND USER_CODE = :uCode
    `;
    await connection.execute(
      orderUpdateSql,
      { code: orderCode, uCode: userCode },
      { autoCommit: false }
    );

    // 3. 주문 아이템 상태 업데이트
    await connection.execute(
      `UPDATE EaGCart_Order_Items SET STATUS = 'CANCELLED' WHERE ORDER_CODE = :code`,
      { code: orderCode },
      { autoCommit: false }
    );

    // 4. [신규] 재고 복구 (각 상품별로 재고 증가)
    const restoreStockSql = `
      UPDATE EaGCart_Products 
      SET CURRENT_STOCK = CURRENT_STOCK + :qty 
      WHERE PRODUCT_CODE = :pCode
    `;

    for (const item of orderItems) {
      await connection.execute(
        restoreStockSql,
        { qty: item.COUNT, pCode: item.PRODUCT_CODE },
        { autoCommit: false }
      );
    }

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Order Cancel Error:", err); // 에러 로깅 추가
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

async function requestClaim(
  orderCode,
  productCodes,
  type,
  reasonCode,
  reasonDetail
) {
  let connection;
  try {
    connection = await db.getConnection();

    const status =
      type === "RETURN" ? "RETURN_REQUESTED" : "EXCHANGE_REQUESTED";
    const fullReason = `${reasonCode}|${reasonDetail}`;

    for (const pCode of productCodes) {
      const sql = `
                UPDATE EaGCart_Order_Items
                SET STATUS = :status,
                    CLAIM_REASON = :reason
                WHERE ORDER_CODE = :orderCode AND PRODUCT_CODE = :pCode
            `;
      await connection.execute(
        sql,
        {
          status: status,
          reason: fullReason,
          orderCode: orderCode,
          pCode: pCode,
        },
        { autoCommit: false }
      );
    }

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  findUserById,
  findUserByEmail,
  findUserByNickname,
  createUser,
  updatePassword,
  updateUser,
  withdrawUser,
  getUserList,
  updateUserStatus,
  toggleWishlist,
  addToCart,
  getCartItems,
  getCartCount,
  updateCartQty,
  deleteCartItem,
  getWishlistItems,
  getUserCoupons,
  getRecentOrder,
  getUsableCoupons,
  createOrder,
  getUserOrders,
  getOrderItems,
  cancelOrder,
  requestClaim,
};

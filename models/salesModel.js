const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 판매(주문) 목록 조회
async function getSalesList(filters) {
  let connection;
  try {
    connection = await db.getConnection();

    let sql = `
      SELECT 
        O.ORDER_CODE,
        M.USER_NAME,
        M.USER_ID,
        TO_CHAR(O.ORDER_DATE, 'YYYY-MM-DD') AS ORDER_DATE,
        O.PAYMENT_AMOUNT,
        O.DELIVERY_STATUS,
        (SELECT COUNT(*) FROM EaGCart_Order_Items WHERE ORDER_CODE = O.ORDER_CODE) AS ITEM_COUNT,
        -- 클레임(반품/교환) 요청이 있는 품목 수 확인
        (SELECT COUNT(*) FROM EaGCart_Order_Items 
         WHERE ORDER_CODE = O.ORDER_CODE 
           AND STATUS IN ('RETURN_REQUESTED', 'EXCHANGE_REQUESTED')) AS CLAIM_COUNT,
        (SELECT P.PRODUCT_NAME 
         FROM EaGCart_Order_Items OI 
         JOIN EaGCart_Products P ON OI.PRODUCT_CODE = P.PRODUCT_CODE 
         WHERE OI.ORDER_CODE = O.ORDER_CODE AND ROWNUM = 1) AS FIRST_ITEM_NAME
      FROM EaGCart_Orders O
      JOIN EaGCart_Members M ON O.USER_CODE = M.USER_CODE
      WHERE 1=1
      AND O.DELIVERY_STATUS != 'CANCELLED'
    `;

    const binds = {};

    if (filters) {
      if (filters.startDate && filters.endDate) {
        sql += ` AND O.ORDER_DATE BETWEEN TO_DATE(:startDate, 'YYYY-MM-DD') AND TO_DATE(:endDate, 'YYYY-MM-DD') + 0.99999`;
        binds.startDate = filters.startDate;
        binds.endDate = filters.endDate;
      }
      if (filters.keyword) {
        sql += ` AND (O.ORDER_CODE LIKE '%' || :keyword || '%' OR M.USER_NAME LIKE '%' || :keyword || '%' OR M.USER_ID LIKE '%' || :keyword || '%')`;
        binds.keyword = filters.keyword;
      }

      // [신규] 클레임 필터: 클레임 카운트가 0보다 큰 주문만 조회
      if (filters.onlyClaim === "true") {
        sql += ` AND (SELECT COUNT(*) FROM EaGCart_Order_Items 
                      WHERE ORDER_CODE = O.ORDER_CODE 
                        AND STATUS IN ('RETURN_REQUESTED', 'EXCHANGE_REQUESTED')) > 0`;
      }
    }

    sql += ` ORDER BY CLAIM_COUNT DESC, O.ORDER_DATE DESC`;

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => {
      let summary = row.FIRST_ITEM_NAME;
      if (row.ITEM_COUNT > 1) {
        summary += ` 외 ${row.ITEM_COUNT - 1}건`;
      }

      return {
        code: row.ORDER_CODE,
        customerName: row.USER_NAME,
        customerId: row.USER_ID,
        date: row.ORDER_DATE,
        price: row.PAYMENT_AMOUNT,
        status: row.DELIVERY_STATUS,
        itemCount: row.ITEM_COUNT,
        productSummary: summary,
        hasClaim: row.CLAIM_COUNT > 0,
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 주문 상세 품목 조회
async function getSalesDetail(orderCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
            SELECT 
                P.PRODUCT_NAME,
                OI.PRODUCT_CODE,
                OI.ITEM_PRICE,
                OI.COUNT,
                OI.STATUS,
                OI.CLAIM_REASON,
                (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI 
                 WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1 AND ROWNUM = 1) AS THUMBNAIL
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
      productName: row.PRODUCT_NAME,
      productCode: row.PRODUCT_CODE,
      price: row.ITEM_PRICE,
      qty: row.COUNT,
      status: row.STATUS,
      claimReason: row.CLAIM_REASON,
      image: row.THUMBNAIL,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 3. 주문 품목 상태 변경
async function updateOrderItemStatus(orderCode, productCode, newStatus) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      UPDATE EaGCart_Order_Items
      SET STATUS = :status
      WHERE ORDER_CODE = :oCode AND PRODUCT_CODE = :pCode
    `;
    await connection.execute(
      sql,
      { status: newStatus, oCode: orderCode, pCode: productCode },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

// 4. 상품 재고 증가
async function increaseProductStock(productCode, qty) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      UPDATE EaGCart_Products
      SET CURRENT_STOCK = CURRENT_STOCK + :qty
      WHERE PRODUCT_CODE = :code
    `;
    await connection.execute(
      sql,
      { qty: qty, code: productCode },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

// 5. 주문 코드로 유저 이메일 조회
async function getUserEmailByOrder(orderCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT M.EMAIL, M.USER_NAME
      FROM EaGCart_Orders O
      JOIN EaGCart_Members M ON O.USER_CODE = M.USER_CODE
      WHERE O.ORDER_CODE = :code
    `;
    const result = await connection.execute(
      sql,
      { code: orderCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

// 6. 상품 검색 (미리보기)
async function searchProductsForAdmin(keyword) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
            SELECT * FROM (
                SELECT PRODUCT_CODE, PRODUCT_NAME, SELLING_PRICE, STATUS
                FROM EaGCart_Products
                WHERE LOWER(PRODUCT_NAME) LIKE '%' || :key || '%' 
                   OR LOWER(PRODUCT_CODE) LIKE '%' || :key || '%'
                ORDER BY REGISTRATION_DATE DESC
            ) WHERE ROWNUM <= 10
        `;
    const result = await connection.execute(
      sql,
      { key: keyword.toLowerCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows.map((row) => ({
      code: row.PRODUCT_CODE,
      name: row.PRODUCT_NAME,
      price: row.SELLING_PRICE,
      status: row.STATUS,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 7. 통합 매출 통계
async function getSalesStats(filters) {
  let connection;
  try {
    connection = await db.getConnection();

    let dateFormat;
    if (filters.period === "year") dateFormat = "YYYY";
    else if (filters.period === "month") dateFormat = "YYYY-MM";
    else dateFormat = "YYYY-MM-DD";

    let sql = `
            SELECT 
                TO_CHAR(O.ORDER_DATE, :fmt) AS PERIOD,
                SUM(OI.ITEM_PRICE * OI.COUNT) AS TOTAL_REVENUE,
                SUM(OI.COUNT) AS TOTAL_QUANTITY,
                SUM((OI.ITEM_PRICE - P.ORIGINAL_PRICE) * OI.COUNT) AS TOTAL_PROFIT
            FROM EaGCart_Order_Items OI
            JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE
            JOIN EaGCart_Products P ON OI.PRODUCT_CODE = P.PRODUCT_CODE
            WHERE O.ORDER_DATE BETWEEN TO_DATE(:startDt, 'YYYY-MM-DD') AND TO_DATE(:endDt, 'YYYY-MM-DD') + 0.99999
              AND O.DELIVERY_STATUS != 'CANCELLED'
        `;

    const binds = {
      fmt: dateFormat,
      startDt: filters.startDate,
      endDt: filters.endDate,
    };

    if (filters.products && filters.products.length > 0) {
      const pKeys = filters.products.map((_, i) => `p_${i}`);
      sql += ` AND OI.PRODUCT_CODE IN (${pKeys.map((k) => ":" + k).join(",")})`;
      filters.products.forEach((code, i) => {
        binds[`p_${i}`] = code;
      });
    }

    if (filters.devices && filters.devices.length > 0) {
      const dKeys = filters.devices.map((_, i) => `d_${i}`);
      sql += ` AND EXISTS (
                SELECT 1 FROM EaGCart_Product_Devices PD 
                WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE 
                  AND PD.DEVICE_CODE IN (${dKeys.map((k) => ":" + k).join(",")})
            )`;
      filters.devices.forEach((code, i) => {
        binds[`d_${i}`] = code;
      });
    }

    if (filters.categories && filters.categories.length > 0) {
      const cKeys = filters.categories.map((_, i) => `c_${i}`);
      sql += ` AND EXISTS (
                SELECT 1 FROM EaGCart_Product_Categories PC 
                WHERE PC.PRODUCT_CODE = P.PRODUCT_CODE 
                  AND PC.CATEGORY_CODE IN (${cKeys
                    .map((k) => ":" + k)
                    .join(",")})
            )`;
      filters.categories.forEach((code, i) => {
        binds[`c_${i}`] = code;
      });
    }

    sql += ` GROUP BY TO_CHAR(O.ORDER_DATE, :fmt) ORDER BY PERIOD`;

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => ({
      label: row.PERIOD,
      revenue: row.TOTAL_REVENUE || 0,
      quantity: row.TOTAL_QUANTITY || 0,
      profit: row.TOTAL_PROFIT || 0,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 8. 대시보드 데이터 조회
async function getDashboardOverview() {
  let connection;
  try {
    connection = await db.getConnection();

    const cardSql = `
      SELECT
        TO_CHAR(SYSDATE, 'YYYY.MM.DD') AS TODAY_DATE,
        (SELECT NVL(SUM(PAYMENT_AMOUNT), 0) FROM EaGCart_Orders
         WHERE TRUNC(ORDER_DATE) = TRUNC(SYSDATE)
           AND DELIVERY_STATUS NOT IN ('CANCELLED', 'RETURNED')) AS TODAY_REVENUE,
        (SELECT COUNT(*) FROM EaGCart_Orders
         WHERE TRUNC(ORDER_DATE) = TRUNC(SYSDATE)
           AND DELIVERY_STATUS NOT IN ('CANCELLED', 'RETURNED')) AS TODAY_COUNT,
        (SELECT COUNT(*) FROM EaGCart_Orders
         WHERE DELIVERY_STATUS = 'PAYMENT_COMPLETED') AS PENDING_DELIVERY,
        (SELECT COUNT(*) FROM EaGCart_Products
         WHERE CURRENT_STOCK < FLOOR(OPTIMAL_STOCK * 0.6)) AS STOCK_ALERT,
        (SELECT COUNT(*) FROM EaGCart_Inquiries
         WHERE STATUS = '대기중') AS PENDING_INQUIRY
      FROM DUAL
    `;

    const claimSql = `
      SELECT
        (SELECT COUNT(*) FROM EaGCart_Order_Items OI
         JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE
         WHERE OI.STATUS LIKE 'RETURN%' 
           AND TRUNC(O.ORDER_DATE) = TRUNC(SYSDATE)) AS RETURN_CNT,
        (SELECT COUNT(*) FROM EaGCart_Order_Items OI
         JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE
         WHERE OI.STATUS LIKE 'EXCHANGE%' 
           AND TRUNC(O.ORDER_DATE) = TRUNC(SYSDATE)) AS EXCHANGE_CNT,
        (SELECT COUNT(*) FROM EaGCart_Order_Items OI
         JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE
         WHERE OI.STATUS = 'CANCELLED' 
           AND TRUNC(O.ORDER_DATE) = TRUNC(SYSDATE)) AS CANCEL_CNT
      FROM DUAL
    `;

    const profitSql = `
      SELECT
        NVL(SUM(OI.ITEM_PRICE * OI.COUNT), 0) AS REVENUE,
        NVL(SUM(P.ORIGINAL_PRICE * OI.COUNT), 0) AS COST
      FROM EaGCart_Order_Items OI
      JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE
      JOIN EaGCart_Products P ON OI.PRODUCT_CODE = P.PRODUCT_CODE
      WHERE O.DELIVERY_STATUS NOT IN ('CANCELLED', 'RETURNED')
        AND TO_CHAR(O.ORDER_DATE, 'YYYY-MM') = TO_CHAR(SYSDATE, 'YYYY-MM')
    `;

    const deviceSql = `
      SELECT * FROM (
        SELECT D.DEVICE_NAME, SUM(OI.COUNT) AS QTY
        FROM EaGCart_Order_Items OI
        JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE
        JOIN EaGCart_Product_Devices PD ON OI.PRODUCT_CODE = PD.PRODUCT_CODE
        JOIN EaGCart_Devices D ON PD.DEVICE_CODE = D.DEVICE_CODE
        WHERE O.DELIVERY_STATUS NOT IN ('CANCELLED', 'RETURNED')
          AND O.ORDER_DATE >= SYSDATE - 30
        GROUP BY D.DEVICE_NAME
        ORDER BY QTY DESC
      ) WHERE ROWNUM <= 10
    `;

    const categorySql = `
      SELECT * FROM (
        SELECT C.CATEGORY_NAME, SUM(OI.COUNT) AS QTY
        FROM EaGCart_Order_Items OI
        JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE
        JOIN EaGCart_Product_Categories PC ON OI.PRODUCT_CODE = PC.PRODUCT_CODE
        JOIN EaGCart_Categories C ON PC.CATEGORY_CODE = C.CATEGORY_CODE
        WHERE O.DELIVERY_STATUS NOT IN ('CANCELLED', 'RETURNED')
          AND O.ORDER_DATE >= SYSDATE - 30
        GROUP BY C.CATEGORY_NAME
        ORDER BY QTY DESC
      ) WHERE ROWNUM <= 10
    `;

    const [cardRes, claimRes, profitRes, deviceRes, catRes] = await Promise.all(
      [
        connection.execute(cardSql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        }),
        connection.execute(claimSql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        }),
        connection.execute(profitSql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        }),
        connection.execute(deviceSql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        }),
        connection.execute(categorySql, [], {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        }),
      ]
    );

    const cards = cardRes.rows[0];
    const claims = claimRes.rows[0];
    const profit = profitRes.rows[0] || { REVENUE: 0, COST: 0 };

    return {
      today: {
        date: cards.TODAY_DATE,
        revenue: (cards.TODAY_REVENUE || 0).toLocaleString(),
        orderCount: cards.TODAY_COUNT || 0,
        pendingDelivery: cards.PENDING_DELIVERY || 0,
        stockAlert: cards.STOCK_ALERT || 0,
        pendingInquiry: cards.PENDING_INQUIRY || 0,
      },
      claims: {
        return: claims.RETURN_CNT || 0,
        exchange: claims.EXCHANGE_CNT || 0,
        cancel: claims.CANCEL_CNT || 0,
      },
      charts: {
        netProfit: {
          revenue: profit.REVENUE || 0,
          cost: profit.COST || 0,
          total: ((profit.REVENUE || 0) - (profit.COST || 0)).toLocaleString(),
        },
        devices: {
          labels: deviceRes.rows.map((r) => r.DEVICE_NAME),
          data: deviceRes.rows.map((r) => r.QTY),
        },
        categories: {
          labels: catRes.rows.map((r) => r.CATEGORY_NAME),
          data: catRes.rows.map((r) => r.QTY),
        },
      },
    };
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getSalesList,
  getSalesDetail,
  updateOrderItemStatus,
  increaseProductStock,
  getUserEmailByOrder,
  searchProductsForAdmin,
  getSalesStats,
  getDashboardOverview,
};

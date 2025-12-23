const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 배송 목록 조회
async function getDeliveryList() {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        O.ORDER_CODE,
        M.USER_NAME AS CUSTOMER_NAME,
        M.USER_ID AS CUSTOMER_ID,
        TO_CHAR(O.ORDER_DATE, 'YYYY-MM-DD') AS ORDER_DATE,
        TO_CHAR(O.DELIVERY_DATE, 'YYYY-MM-DD') AS DELIVERY_DATE,
        O.DELIVERY_STATUS,
        O.SHIPPING_ADDRESS,
        O.PHONE_NUMBER,     
        O.DELIVERY_REQUEST, 
        (SELECT COUNT(*) FROM EaGCart_Order_Items WHERE ORDER_CODE = O.ORDER_CODE) AS ITEM_COUNT,
        (SELECT P.PRODUCT_NAME 
         FROM EaGCart_Order_Items OI 
         JOIN EaGCart_Products P ON OI.PRODUCT_CODE = P.PRODUCT_CODE 
         WHERE OI.ORDER_CODE = O.ORDER_CODE AND ROWNUM = 1) AS FIRST_ITEM_NAME
      FROM EaGCart_Orders O
      JOIN EaGCart_Members M ON O.USER_CODE = M.USER_CODE
      ORDER BY O.ORDER_DATE DESC
    `;

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => {
      const parts = (row.SHIPPING_ADDRESS || "").split("|");
      const address = `${parts[0] || ""} ${parts[1] || ""}`.trim();
      const receiver = parts[2] || row.CUSTOMER_NAME;

      let summaryName = row.FIRST_ITEM_NAME;
      if (row.ITEM_COUNT > 1) {
        summaryName += ` 외 ${row.ITEM_COUNT - 1}건`;
      }

      return {
        code: row.ORDER_CODE,
        orderer: `${row.CUSTOMER_NAME} (${row.CUSTOMER_ID})`,
        receiver: receiver,
        phone: row.PHONE_NUMBER,
        request: row.DELIVERY_REQUEST || "없음",
        address: address,
        date: row.ORDER_DATE,
        eta: row.DELIVERY_DATE,
        status: row.DELIVERY_STATUS,
        summary: summaryName,
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 주문 상품 상세 목록 조회
async function getDeliveryItems(orderCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        P.PRODUCT_NAME,
        OI.COUNT,
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
      name: row.PRODUCT_NAME,
      qty: row.COUNT,
      image: row.THUMBNAIL,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 3. 배송 정보(상태 및 예정일) 변경
async function updateDeliveryInfo(orderCode, status, date) {
  let connection;
  try {
    connection = await db.getConnection();
    // [핵심] 관리자가 입력한 date를 DELIVERY_DATE로 업데이트
    const sql = `
      UPDATE EaGCart_Orders 
      SET DELIVERY_STATUS = :status,
          DELIVERY_DATE = TO_DATE(:deliveryDate, 'YYYY-MM-DD')
      WHERE ORDER_CODE = :code
    `;
    await connection.execute(
      sql,
      {
        status: status,
        deliveryDate: date, // 여기서 받은 날짜가 DB에 저장됨
        code: orderCode,
      },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getDeliveryList,
  getDeliveryItems,
  updateDeliveryInfo,
};

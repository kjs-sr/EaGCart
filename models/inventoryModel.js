const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 재고 목록 조회
async function getInventoryList() {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `SELECT PRODUCT_CODE, PRODUCT_NAME, CURRENT_STOCK, OPTIMAL_STOCK FROM EaGCart_Products ORDER BY PRODUCT_CODE ASC`;
    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return result.rows.map((row) => ({
      code: row.PRODUCT_CODE,
      name: row.PRODUCT_NAME,
      current: row.CURRENT_STOCK,
      target: row.OPTIMAL_STOCK,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 최근 3개월 판매량 조회 (적정재고 계산용)
async function getOrderCountLast3Months(productCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `SELECT NVL(SUM(OI.COUNT), 0) AS TOTAL_SOLD FROM EaGCart_Order_Items OI JOIN EaGCart_Orders O ON OI.ORDER_CODE = O.ORDER_CODE WHERE OI.PRODUCT_CODE = :pCode AND O.ORDER_DATE >= ADD_MONTHS(SYSDATE, -3)`;
    // [수정] 바인드 변수명 변경 (:productCode -> :pCode)
    const result = await connection.execute(sql, { pCode: productCode });
    return result.rows[0][0];
  } finally {
    if (connection) await connection.close();
  }
}

// 3. 재고 및 적정재고 업데이트
async function updateProductStock(code, current, optimal) {
  let connection;
  try {
    connection = await db.getConnection();
    // [수정] :current는 오라클 예약어(CURRENT)와 충돌 가능성이 높으므로 :newCurrent로 변경
    const sql = `UPDATE EaGCart_Products SET CURRENT_STOCK = :newCurrent, OPTIMAL_STOCK = :newOptimal WHERE PRODUCT_CODE = :pCode`;
    await connection.execute(
      sql,
      { newCurrent: current, newOptimal: optimal, pCode: code },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error("Stock Update Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

// 4. 입고 처리 (기록 + 재고증가)
async function addInbound(productCode, quantity) {
  let connection;
  try {
    connection = await db.getConnection();
    const inboundCode = "I" + Date.now();

    // [수정] 변수명 명확화 및 중복 방지
    await connection.execute(
      `INSERT INTO EaGCart_Stock_Entries (INBOUND_CODE, PRODUCT_CODE, INBOUND_QUANTITY, INBOUND_DATE) VALUES (:ibCode, :pCode, :qty, SYSDATE)`,
      { ibCode: inboundCode, pCode: productCode, qty: quantity },
      { autoCommit: false }
    );

    await connection.execute(
      `UPDATE EaGCart_Products SET CURRENT_STOCK = CURRENT_STOCK + :qty WHERE PRODUCT_CODE = :pCode`,
      { qty: quantity, pCode: productCode },
      { autoCommit: false }
    );

    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Inbound Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

// 5. 입고 내역 조회
async function getInboundHistory(startDate, endDate, search) {
  let connection;
  try {
    connection = await db.getConnection();
    let sql = `SELECT H.INBOUND_CODE, P.PRODUCT_NAME, P.PRODUCT_CODE, H.INBOUND_QUANTITY, TO_CHAR(H.INBOUND_DATE, 'YYYY-MM-DD HH24:MI') AS IN_DATE FROM EaGCart_Stock_Entries H JOIN EaGCart_Products P ON H.PRODUCT_CODE = P.PRODUCT_CODE WHERE 1=1`;
    const binds = {};

    if (startDate) {
      sql += ` AND H.INBOUND_DATE >= TO_DATE(:sDate, 'YYYY-MM-DD')`;
      binds.sDate = startDate;
    }
    if (endDate) {
      sql += ` AND H.INBOUND_DATE < TO_DATE(:eDate, 'YYYY-MM-DD') + 1`;
      binds.eDate = endDate;
    }
    if (search) {
      // [중요 수정] ORA-01745 방지: 동일한 값이라도 바인드 변수명을 다르게 지정해야 함
      // :search 하나를 여러 번 쓰면 에러가 발생할 수 있음 -> :search1, :search2, :search3로 분리
      sql += ` AND (LOWER(P.PRODUCT_NAME) LIKE '%' || :search1 || '%' OR LOWER(P.PRODUCT_CODE) LIKE '%' || :search2 || '%' OR LOWER(H.INBOUND_CODE) LIKE '%' || :search3 || '%')`;
      const searchTerm = search.toLowerCase();
      binds.search1 = searchTerm;
      binds.search2 = searchTerm;
      binds.search3 = searchTerm;
    }

    sql += ` ORDER BY H.INBOUND_DATE DESC`;

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return result.rows.map((row) => ({
      code: row.INBOUND_CODE,
      prodCode: row.PRODUCT_CODE,
      prodName: row.PRODUCT_NAME,
      qty: row.INBOUND_QUANTITY,
      date: row.IN_DATE,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getInventoryList,
  getOrderCountLast3Months,
  updateProductStock,
  addInbound,
  getInboundHistory,
};

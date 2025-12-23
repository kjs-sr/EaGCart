const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 할인 목록 조회
async function getDiscountList() {
  let connection;
  try {
    connection = await db.getConnection();

    // [수정] 모든 컬럼명을 DISCOUNT_PRICE로 통일
    // 주의: 실제 DB 테이블에 DISCOUNT_PRICE 컬럼이 있어야 합니다.
    const sql = `
      SELECT 
        D.DISCOUNT_CODE, D.PRODUCT_CODE, P.PRODUCT_NAME, P.SELLING_PRICE AS NORMAL_PRICE,
        D.DISCOUNT_PRICE, -- [중요] 컬럼명 확인 필수
        D.DISCOUNT_RATE,
        TO_CHAR(D.START_DATE, 'YYYY.MM.DD') AS START_DATE,
        TO_CHAR(D.END_DATE, 'YYYY.MM.DD') AS END_DATE,
        D.STATUS,
        CASE 
          WHEN D.DISCOUNT_PRICE IS NOT NULL THEN D.DISCOUNT_PRICE -- 할인 후 가격이 저장되어 있으므로 그대로 사용
          WHEN D.DISCOUNT_RATE IS NOT NULL THEN P.SELLING_PRICE * (1 - D.DISCOUNT_RATE / 100)
          ELSE P.SELLING_PRICE
        END AS SALE_PRICE
      FROM EaGCart_Discounts D
      JOIN EaGCart_Products P ON D.PRODUCT_CODE = P.PRODUCT_CODE
      ORDER BY D.START_DATE DESC
    `;

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => {
      let rateStr = row.DISCOUNT_RATE ? `${row.DISCOUNT_RATE}%` : "-";

      let status = row.STATUS;
      const todayStr = new Date().toISOString().split("T")[0];
      const startStr = row.START_DATE.replace(/\./g, "-");
      const endStr = row.END_DATE.replace(/\./g, "-");

      if (todayStr < startStr) status = "예정";
      else if (todayStr > endStr) status = "종료";
      else status = "진행중";

      return {
        code: row.DISCOUNT_CODE,
        product: row.PRODUCT_CODE,
        name: row.PRODUCT_NAME,
        normal: row.NORMAL_PRICE.toLocaleString(),
        sale: Math.floor(row.SALE_PRICE).toLocaleString(),
        rate: rateStr,
        startDate: row.START_DATE,
        endDate: row.END_DATE,
        status: status,
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// [신규] 할인 기간 중복 검사 함수
async function checkDiscountOverlap(productCodes, startDate, endDate) {
  let connection;
  try {
    connection = await db.getConnection();
    const overlaps = [];

    // 중복 검사 쿼리: (기존시작 <= 새종료) AND (기존종료 >= 새시작)
    // 이 조건이 성립하면 기간이 하루라도 겹치는 것임
    const checkSql = `
      SELECT P.PRODUCT_NAME 
      FROM EaGCart_Discounts D
      JOIN EaGCart_Products P ON D.PRODUCT_CODE = P.PRODUCT_CODE
      WHERE D.PRODUCT_CODE = :code
        AND D.START_DATE <= TO_DATE(:newEndDate, 'YYYY-MM-DD')
        AND D.END_DATE >= TO_DATE(:newStartDate, 'YYYY-MM-DD')
    `;

    // 배열 처리 (Oracle IN 절 바인딩 이슈 회피를 위해 루프 사용)
    const codes = Array.isArray(productCodes) ? productCodes : [productCodes];

    for (const code of codes) {
      const result = await connection.execute(
        checkSql,
        {
          code: code,
          newStartDate: startDate,
          newEndDate: endDate,
        },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (result.rows.length > 0) {
        overlaps.push(result.rows[0].PRODUCT_NAME);
      }
    }

    return overlaps; // 중복된 상품명 배열 반환
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 할인 등록 (할인 후 가격 계산 및 저장)
async function createDiscount(data) {
  let connection;
  try {
    connection = await db.getConnection();

    // 상품 가격 조회용 쿼리
    const priceSql = `SELECT SELLING_PRICE FROM EaGCart_Products WHERE PRODUCT_CODE = :code`;

    // 할인 등록 쿼리
    const insertSql = `
      INSERT INTO EaGCart_Discounts (
        DISCOUNT_CODE, PRODUCT_CODE, DISCOUNT_PRICE, DISCOUNT_RATE, START_DATE, END_DATE, STATUS
      ) VALUES (
        :code, :prodCode, :discountedPrice, :rate, TO_DATE(:startDate, 'YYYY-MM-DD'), TO_DATE(:endDate, 'YYYY-MM-DD'), '진행중'
      )
    `;

    const productCodes = Array.isArray(data.productCodes)
      ? data.productCodes
      : [data.productCodes];
    const rate = parseInt(data.discountValue); // 할인율

    for (let i = 0; i < productCodes.length; i++) {
      const prodCode = productCodes[i];

      // 1. 해당 상품의 원래 판매가 조회
      const priceResult = await connection.execute(priceSql, {
        code: prodCode,
      });

      if (priceResult.rows && priceResult.rows.length > 0) {
        const originalPrice = priceResult.rows[0][0]; // SELLING_PRICE

        // 2. 할인 후 가격 계산 (원 단위 절사)
        const discountedPrice = Math.floor(originalPrice * (1 - rate / 100));

        // 3. 할인 정보 저장
        const discountCode = "DC" + Date.now() + i;
        await connection.execute(
          insertSql,
          {
            code: discountCode,
            prodCode: prodCode,
            discountedPrice: discountedPrice,
            rate: rate,
            startDate: data.startDate,
            endDate: data.endDate,
          },
          { autoCommit: false }
        );
      }
    }
    await connection.commit();
    return true;
  } catch (err) {
    if (connection) await connection.rollback();
    console.error("Discount Create Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

// 3. 할인 상세 정보 조회 (수정 모달용)
async function getDiscountByCode(code) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        D.DISCOUNT_CODE, 
        D.PRODUCT_CODE, 
        P.PRODUCT_NAME, 
        P.SELLING_PRICE,
        D.DISCOUNT_RATE,
        TO_CHAR(D.START_DATE, 'YYYY-MM-DD') AS START_DATE,
        TO_CHAR(D.END_DATE, 'YYYY-MM-DD') AS END_DATE
      FROM EaGCart_Discounts D
      JOIN EaGCart_Products P ON D.PRODUCT_CODE = P.PRODUCT_CODE
      WHERE D.DISCOUNT_CODE = :code
    `;
    const result = await connection.execute(
      sql,
      { code },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

// 4. 할인 정보 수정
async function updateDiscount(data) {
  let connection;
  try {
    connection = await db.getConnection();

    // 1. 현재 상품의 판매가 조회 (재계산 위해)
    const priceSql = `
      SELECT P.SELLING_PRICE 
      FROM EaGCart_Discounts D
      JOIN EaGCart_Products P ON D.PRODUCT_CODE = P.PRODUCT_CODE
      WHERE D.DISCOUNT_CODE = :code
    `;
    const priceResult = await connection.execute(priceSql, { code: data.code });

    if (priceResult.rows.length === 0)
      throw new Error("할인 정보를 찾을 수 없습니다.");

    const originalPrice = priceResult.rows[0][0];
    const rate = parseInt(data.rate);
    const discountedPrice = Math.floor(originalPrice * (1 - rate / 100));

    // 2. 업데이트 실행
    const updateSql = `
      UPDATE EaGCart_Discounts
      SET DISCOUNT_RATE = :rate,
          DISCOUNT_PRICE = :discountedPrice,
          START_DATE = TO_DATE(:startDate, 'YYYY-MM-DD'),
          END_DATE = TO_DATE(:endDate, 'YYYY-MM-DD')
      WHERE DISCOUNT_CODE = :code
    `;

    await connection.execute(
      updateSql,
      {
        rate: rate,
        discountedPrice: discountedPrice,
        startDate: data.startDate,
        endDate: data.endDate,
        code: data.code,
      },
      { autoCommit: true }
    );

    return true;
  } finally {
    if (connection) await connection.close();
  }
}

// [신규] 특정 상품의 할인 히스토리 조회
async function getDiscountHistory(productCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        D.DISCOUNT_RATE, 
        D.DISCOUNT_PRICE, 
        TO_CHAR(D.START_DATE, 'YYYY.MM.DD') AS START_DATE, 
        TO_CHAR(D.END_DATE, 'YYYY.MM.DD') AS END_DATE,
        P.SELLING_PRICE AS ORIGINAL_PRICE
      FROM EaGCart_Discounts D
      JOIN EaGCart_Products P ON D.PRODUCT_CODE = P.PRODUCT_CODE
      WHERE D.PRODUCT_CODE = :code
      ORDER BY D.START_DATE DESC
    `;
    const result = await connection.execute(
      sql,
      { code: productCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getDiscountList,
  checkDiscountOverlap,
  createDiscount,
  getDiscountByCode,
  updateDiscount,
  getDiscountHistory, // [신규] export 추가
};

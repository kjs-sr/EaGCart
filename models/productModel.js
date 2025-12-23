const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 기기 목록 조회
async function getDevices() {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT * FROM EaGCart_Devices ORDER BY DEVICE_CODE`
    );
    return result.rows.map((row) => ({ code: row[0], name: row[1] }));
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 카테고리 목록 조회
async function getCategories() {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT * FROM EaGCart_Categories ORDER BY CATEGORY_CODE`
    );
    return result.rows.map((row) => ({ code: row[0], name: row[1] }));
  } finally {
    if (connection) await connection.close();
  }
}

// 코드 생성 헬퍼
async function generateNextCode(connection, tableName, colName, prefix) {
  const result = await connection.execute(
    `SELECT MAX(${colName}) FROM ${tableName}`
  );
  let maxCode = result.rows[0][0];
  if (!maxCode) return prefix + "001";
  let numStr = maxCode.replace(prefix, "");
  let nextNum = parseInt(numStr) + 1;
  return prefix + String(nextNum).padStart(3, "0");
}

// 태그 관리 (추가/수정/삭제)
async function addTag(type, name) {
  let connection;
  try {
    connection = await db.getConnection();
    let tableName =
      type === "device" ? "EaGCart_Devices" : "EaGCart_Categories";
    let colCode = type === "device" ? "DEVICE_CODE" : "CATEGORY_CODE";
    let colName = type === "device" ? "DEVICE_NAME" : "CATEGORY_NAME";
    let prefix = type === "device" ? "D" : "C";
    const newCode = await generateNextCode(
      connection,
      tableName,
      colCode,
      prefix
    );
    await connection.execute(
      `INSERT INTO ${tableName} (${colCode}, ${colName}) VALUES (:tagCode, :tagName)`,
      { tagCode: newCode, tagName: name },
      { autoCommit: true }
    );
    return newCode;
  } finally {
    if (connection) await connection.close();
  }
}

async function updateTag(type, code, name) {
  let connection;
  try {
    connection = await db.getConnection();
    let tableName =
      type === "device" ? "EaGCart_Devices" : "EaGCart_Categories";
    let colCode = type === "device" ? "DEVICE_CODE" : "CATEGORY_CODE";
    let colName = type === "device" ? "DEVICE_NAME" : "CATEGORY_NAME";
    await connection.execute(
      `UPDATE ${tableName} SET ${colName} = :tagName WHERE ${colCode} = :tagCode`,
      { tagName: name, tagCode: code },
      { autoCommit: true }
    );
  } finally {
    if (connection) await connection.close();
  }
}

async function deleteTag(type, code) {
  let connection;
  try {
    connection = await db.getConnection();
    let tableName =
      type === "device" ? "EaGCart_Devices" : "EaGCart_Categories";
    let colCode = type === "device" ? "DEVICE_CODE" : "CATEGORY_CODE";
    await connection.execute(
      `DELETE FROM ${tableName} WHERE ${colCode} = :tagCode`,
      { tagCode: code },
      { autoCommit: true }
    );
  } catch (err) {
    if (
      err.message.includes("integrity constraint") ||
      err.code === "ORA-02292"
    ) {
      throw new Error("이미 상품에 사용 중인 태그는 삭제할 수 없습니다.");
    }
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

// 3. 상품 등록
async function createProduct(data, images) {
  let connection;
  try {
    connection = await db.getConnection();
    const productCode = "P" + Date.now();
    const productSql = `
      INSERT INTO EaGCart_Products (
        PRODUCT_CODE, PRODUCT_NAME, SELLING_PRICE, ORIGINAL_PRICE, 
        PRODUCT_DESCRIPTION, CURRENT_STOCK, OPTIMAL_STOCK, STATUS, 
        REGISTRATION_DATE, LAST_MODIFIED_DATE
      ) VALUES (
        :productCode, :productName, :productPrice, :originalPrice, 
        :productDescription, 0, 0, '품절', SYSDATE, SYSDATE
      )
    `;
    await connection.execute(
      productSql,
      {
        productCode: productCode,
        productName: data.name,
        productPrice: data.price,
        originalPrice: data.originalPrice,
        productDescription: data.description,
      },
      { autoCommit: false }
    );

    if (data.devices && data.devices.length > 0) {
      const deviceSql = `INSERT INTO EaGCart_Product_Devices VALUES (:pCode, :dCode)`;
      for (const dCode of data.devices)
        await connection.execute(
          deviceSql,
          { pCode: productCode, dCode: dCode },
          { autoCommit: false }
        );
    }
    if (data.categories && data.categories.length > 0) {
      const catSql = `INSERT INTO EaGCart_Product_Categories VALUES (:pCode, :cCode)`;
      for (const cCode of data.categories)
        await connection.execute(
          catSql,
          { pCode: productCode, cCode: cCode },
          { autoCommit: false }
        );
    }
    if (images && images.length > 0) {
      const imgSql = `INSERT INTO EaGCart_Product_Images VALUES (:pCode, :imgSeq, :imgPath)`;
      for (let i = 0; i < images.length; i++)
        await connection.execute(
          imgSql,
          {
            pCode: productCode,
            imgSeq: i + 1,
            imgPath: `/images/products/${images[i].filename}`,
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

// 4. 상품 목록 조회
async function getProductList() {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        P.PRODUCT_CODE, 
        P.PRODUCT_NAME, 
        P.SELLING_PRICE, 
        P.STATUS, 
        TO_CHAR(P.REGISTRATION_DATE, 'YYYY.MM.DD') AS REG_DATE, 
        TO_CHAR(P.LAST_MODIFIED_DATE, 'YYYY.MM.DD') AS MOD_DATE, 
        (SELECT LISTAGG(D.DEVICE_NAME, ', ') WITHIN GROUP (ORDER BY D.DEVICE_NAME) 
         FROM EaGCart_Product_Devices PD 
         JOIN EaGCart_Devices D ON PD.DEVICE_CODE = D.DEVICE_CODE 
         WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE) AS DEVICES, 
        (SELECT LISTAGG(C.CATEGORY_NAME, ', ') WITHIN GROUP (ORDER BY C.CATEGORY_NAME) 
         FROM EaGCart_Product_Categories PC 
         JOIN EaGCart_Categories C ON PC.CATEGORY_CODE = C.CATEGORY_CODE 
         WHERE PC.PRODUCT_CODE = P.PRODUCT_CODE) AS CATEGORIES, 
        (SELECT IMAGE_PATH 
         FROM EaGCart_Product_Images PI 
         WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL 
      FROM EaGCart_Products P 
      ORDER BY P.REGISTRATION_DATE DESC
    `;
    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });
    return result.rows.map((row) => ({
      code: row.PRODUCT_CODE,
      name: row.PRODUCT_NAME,
      price: row.SELLING_PRICE.toLocaleString(),
      status: row.STATUS,
      regDate: row.REG_DATE,
      modDate: row.MOD_DATE,
      device: row.DEVICES || "-",
      category: row.CATEGORIES || "-",
      thumbnail: row.THUMBNAIL,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 5. 상품 상세 조회
async function getProductByCode(code) {
  let connection;
  try {
    connection = await db.getConnection();
    const productResult = await connection.execute(
      `SELECT PRODUCT_CODE, PRODUCT_NAME, SELLING_PRICE, ORIGINAL_PRICE, PRODUCT_DESCRIPTION, STATUS 
       FROM EaGCart_Products 
       WHERE PRODUCT_CODE = :productCode`,
      { productCode: code },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { PRODUCT_DESCRIPTION: { type: oracledb.STRING } },
      }
    );
    const product = productResult.rows[0];
    if (!product) return null;

    const devicesResult = await connection.execute(
      `SELECT DEVICE_CODE FROM EaGCart_Product_Devices WHERE PRODUCT_CODE = :productCode`,
      { productCode: code }
    );
    const categoriesResult = await connection.execute(
      `SELECT CATEGORY_CODE FROM EaGCart_Product_Categories WHERE PRODUCT_CODE = :productCode`,
      { productCode: code }
    );
    const imagesResult = await connection.execute(
      `SELECT IMAGE_SEQUENCE, IMAGE_PATH FROM EaGCart_Product_Images WHERE PRODUCT_CODE = :productCode ORDER BY IMAGE_SEQUENCE`,
      { productCode: code },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return {
      PRODUCT_CODE: product.PRODUCT_CODE,
      PRODUCT_NAME: product.PRODUCT_NAME,
      SELLING_PRICE: product.SELLING_PRICE,
      ORIGINAL_PRICE: product.ORIGINAL_PRICE,
      PRODUCT_DESCRIPTION: product.PRODUCT_DESCRIPTION,
      STATUS: product.STATUS,
      devices: devicesResult.rows.map((row) => row[0]),
      categories: categoriesResult.rows.map((row) => row[0]),
      images: imagesResult.rows,
    };
  } finally {
    if (connection) await connection.close();
  }
}

async function getProductDetail(code, userCode = null) {
  let connection;
  try {
    connection = await db.getConnection();

    // 1. 상품 기본 정보 + 할인 + 기기/장르 + 찜 여부
    // [변경점] 찜 여부를 서브쿼리가 아닌 LEFT JOIN으로 체크하여 안정성 확보
    const sql = `
      SELECT 
        P.PRODUCT_CODE, 
        P.PRODUCT_NAME, 
        P.SELLING_PRICE, 
        P.ORIGINAL_PRICE,
        P.PRODUCT_DESCRIPTION, 
        P.STATUS,
        TO_CHAR(P.REGISTRATION_DATE, 'YYYY.MM.DD') AS REG_DATE,
        D.DISCOUNT_RATE,
        D.DISCOUNT_PRICE,
        (SELECT LISTAGG(DEV.DEVICE_NAME, ', ') WITHIN GROUP (ORDER BY DEV.DEVICE_NAME)
         FROM EaGCart_Product_Devices PD
         JOIN EaGCart_Devices DEV ON PD.DEVICE_CODE = DEV.DEVICE_CODE
         WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE) AS DEVICES,
        (SELECT LISTAGG(CAT.CATEGORY_NAME, ', ') WITHIN GROUP (ORDER BY CAT.CATEGORY_NAME)
         FROM EaGCart_Product_Categories PC
         JOIN EaGCart_Categories CAT ON PC.CATEGORY_CODE = CAT.CATEGORY_CODE
         WHERE PC.PRODUCT_CODE = P.PRODUCT_CODE) AS CATEGORIES,
        -- [핵심] 찜 테이블과 조인되었으면 1, 아니면 0 반환
        CASE WHEN W.USER_CODE IS NOT NULL THEN 1 ELSE 0 END AS IS_WISHED
      FROM EaGCart_Products P
      -- [변경점] 할인 정보 조인
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
      -- [변경점] 찜 테이블 조인 (상품코드와 유저코드가 모두 일치하는지 확인)
      LEFT JOIN EaGCart_Wishlists W 
        ON P.PRODUCT_CODE = W.PRODUCT_CODE 
        AND W.USER_CODE = :userCode
      WHERE P.PRODUCT_CODE = :productCode
    `;

    const productResult = await connection.execute(
      sql,
      {
        productCode: code,
        userCode: userCode || "", // 비로그인 시 빈 문자열 처리
      },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: { PRODUCT_DESCRIPTION: { type: oracledb.STRING } },
      }
    );

    if (productResult.rows.length === 0) return null;
    const productRow = productResult.rows[0];

    // 2. 이미지 목록 조회
    const imgSql = `SELECT IMAGE_PATH FROM EaGCart_Product_Images WHERE PRODUCT_CODE = :code ORDER BY IMAGE_SEQUENCE ASC`;
    const imgResult = await connection.execute(
      imgSql,
      { code: code },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const gallery = imgResult.rows.map((row) => row.IMAGE_PATH);

    // 3. 리뷰 목록 조회
    let reviews = [];
    try {
      const reviewSql = `
            SELECT R.REVIEW_ID, R.RATING, R.CONTENT, TO_CHAR(R.CREATED_AT, 'YYYY.MM.DD') AS DATE_STR, U.NICKNAME
            FROM EaGCart_Reviews R
            JOIN EaGCart_Users U ON R.USER_ID = U.USER_ID
            WHERE R.PRODUCT_CODE = :code
            ORDER BY R.CREATED_AT DESC
        `;
      const reviewResult = await connection.execute(
        reviewSql,
        { code: code },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      reviews = reviewResult.rows.map((r) => ({
        id: r.REVIEW_ID,
        rating: r.RATING,
        content: r.CONTENT,
        date: r.DATE_STR,
        nickname: r.NICKNAME,
      }));
    } catch (e) {
      reviews = [];
    }

    // 가격 계산
    let salePrice = null;
    let discountRate = 0;
    if (productRow.DISCOUNT_PRICE) {
      salePrice = productRow.DISCOUNT_PRICE;
      discountRate = Math.round(
        ((productRow.SELLING_PRICE - productRow.DISCOUNT_PRICE) /
          productRow.SELLING_PRICE) *
          100
      );
    } else if (productRow.DISCOUNT_RATE) {
      discountRate = productRow.DISCOUNT_RATE;
      salePrice = Math.floor(
        productRow.SELLING_PRICE * (1 - productRow.DISCOUNT_RATE / 100)
      );
    }

    return {
      code: productRow.PRODUCT_CODE,
      name: productRow.PRODUCT_NAME,
      price: productRow.SELLING_PRICE,
      originalPrice: productRow.ORIGINAL_PRICE,
      salePrice: salePrice,
      discountRate: discountRate,
      description: productRow.PRODUCT_DESCRIPTION,
      status: productRow.STATUS,
      regDate: productRow.REG_DATE,
      devices: productRow.DEVICES,
      categories: productRow.CATEGORIES,
      gallery: gallery,
      reviews: reviews,
      // [핵심 수정] == 1 (느슨한 비교) 사용하여 숫자/문자열 모두 대응
      isWished: productRow.IS_WISHED == 1,
    };
  } finally {
    if (connection) await connection.close();
  }
}

// 6. 상품 업데이트
async function updateProduct(code, data, newImages) {
  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(
      `UPDATE EaGCart_Products 
       SET PRODUCT_NAME = :productName, 
           SELLING_PRICE = :productPrice, 
           ORIGINAL_PRICE = :originalPrice, 
           PRODUCT_DESCRIPTION = :productDescription, 
           STATUS = :productStatus, 
           LAST_MODIFIED_DATE = SYSDATE 
       WHERE PRODUCT_CODE = :productCode`,
      {
        productName: data.name,
        productPrice: data.price,
        originalPrice: data.originalPrice,
        productDescription: data.description,
        productStatus: data.status,
        productCode: code,
      },
      { autoCommit: false }
    );

    await connection.execute(
      `DELETE FROM EaGCart_Product_Devices WHERE PRODUCT_CODE = :productCode`,
      { productCode: code },
      { autoCommit: false }
    );
    if (data.devices && data.devices.length > 0)
      for (const dCode of data.devices)
        await connection.execute(
          `INSERT INTO EaGCart_Product_Devices VALUES (:productCode, :deviceCode)`,
          { productCode: code, deviceCode: dCode },
          { autoCommit: false }
        );

    await connection.execute(
      `DELETE FROM EaGCart_Product_Categories WHERE PRODUCT_CODE = :productCode`,
      { productCode: code },
      { autoCommit: false }
    );
    if (data.categories && data.categories.length > 0)
      for (const cCode of data.categories)
        await connection.execute(
          `INSERT INTO EaGCart_Product_Categories VALUES (:productCode, :categoryCode)`,
          { productCode: code, categoryCode: cCode },
          { autoCommit: false }
        );

    if (data.imageOrder) {
      await connection.execute(
        `DELETE FROM EaGCart_Product_Images WHERE PRODUCT_CODE = :productCode`,
        { productCode: code },
        { autoCommit: false }
      );
      const orderList = JSON.parse(data.imageOrder);
      let seq = 1;
      for (const item of orderList) {
        let imagePath =
          item.type === "EXISTING"
            ? item.path
            : newImages[parseInt(item.index)]
            ? `/images/products/${newImages[parseInt(item.index)].filename}`
            : "";
        if (imagePath)
          await connection.execute(
            `INSERT INTO EaGCart_Product_Images VALUES (:productCode, :imgSeq, :imgPath)`,
            { productCode: code, imgSeq: seq++, imgPath: imagePath },
            { autoCommit: false }
          );
      }
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

// 7. 상품 검색 (할인 등록 모달용)
async function searchProducts(keyword) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT * FROM (
        SELECT 
          P.PRODUCT_CODE, 
          P.PRODUCT_NAME, 
          P.SELLING_PRICE, 
          (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL
        FROM EaGCart_Products P
        WHERE LOWER(P.PRODUCT_NAME) LIKE '%' || :searchKeyword || '%' 
           OR LOWER(P.PRODUCT_CODE) LIKE '%' || :searchKeyword || '%'
        ORDER BY P.PRODUCT_NAME ASC
      ) WHERE ROWNUM <= 10
    `;
    const result = await connection.execute(
      sql,
      { searchKeyword: keyword.toLowerCase() },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows.map((row) => ({
      code: row.PRODUCT_CODE,
      name: row.PRODUCT_NAME,
      price: row.SELLING_PRICE,
      thumbnail: row.THUMBNAIL,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 사용자용 상품 검색 (헤더 미리보기용)
async function searchProductsPublic(keyword) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT * FROM (
        SELECT 
          P.PRODUCT_CODE, 
          P.PRODUCT_NAME, 
          P.SELLING_PRICE,
          P.STATUS, -- [추가] 상태 확인
          D.DISCOUNT_RATE, 
          D.DISCOUNT_PRICE, 
          (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL
        FROM EaGCart_Products P
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
        -- [수정] 품절 상태도 포함
        WHERE P.STATUS IN ('판매중', '품절')
          AND LOWER(P.PRODUCT_NAME) LIKE '%' || :searchKeyword || '%'
        ORDER BY P.PRODUCT_NAME ASC
      ) WHERE ROWNUM <= 8
    `;
    const result = await connection.execute(
      sql,
      { searchKeyword: keyword.toLowerCase() },
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
        thumbnail: row.THUMBNAIL,
        status: row.STATUS, // [추가]
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// 메인 페이지용 최신 상품 목록 조회
async function getMainProductList() {
  let connection;
  try {
    connection = await db.getConnection();

    const sql = `
      SELECT * FROM (
        SELECT 
          P.PRODUCT_CODE, 
          P.PRODUCT_NAME, 
          P.SELLING_PRICE,
          P.STATUS, -- [추가]
          D.DISCOUNT_RATE, 
          D.DISCOUNT_PRICE, 
          (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL,
          (SELECT LISTAGG(D.DEVICE_NAME, ', ') WITHIN GROUP (ORDER BY D.DEVICE_NAME) 
           FROM EaGCart_Product_Devices PD 
           JOIN EaGCart_Devices D ON PD.DEVICE_CODE = D.DEVICE_CODE 
           WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE) AS DEVICES,
          (SELECT LISTAGG(C.CATEGORY_NAME, ', ') WITHIN GROUP (ORDER BY C.CATEGORY_NAME) 
           FROM EaGCart_Product_Categories PC 
           JOIN EaGCart_Categories C ON PC.CATEGORY_CODE = C.CATEGORY_CODE 
           WHERE PC.PRODUCT_CODE = P.PRODUCT_CODE) AS CATEGORIES
        FROM EaGCart_Products P
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
        -- [수정] 품절 상태도 포함
        WHERE P.STATUS IN ('판매중', '품절')
        ORDER BY P.REGISTRATION_DATE DESC
      ) WHERE ROWNUM <= 20
    `;

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => {
      let salePrice = null;
      let discountRate = null;

      if (row.DISCOUNT_PRICE) {
        salePrice = row.DISCOUNT_PRICE;
        discountRate = Math.round(
          ((row.SELLING_PRICE - row.DISCOUNT_PRICE) / row.SELLING_PRICE) * 100
        );
      } else if (row.DISCOUNT_RATE) {
        discountRate = row.DISCOUNT_RATE;
        salePrice = Math.floor(
          row.SELLING_PRICE * (1 - row.DISCOUNT_RATE / 100)
        );
      }

      return {
        code: row.PRODUCT_CODE,
        name: row.PRODUCT_NAME,
        price: row.SELLING_PRICE,
        salePrice: salePrice,
        discountRate: discountRate,
        thumbnail: row.THUMBNAIL,
        devices: row.DEVICES,
        categories: row.CATEGORIES,
        status: row.STATUS, // [추가]
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// 메인 페이지용 할인 상품 목록 조회
async function getDiscountedProductList() {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT * FROM (
        SELECT 
          P.PRODUCT_CODE, 
          P.PRODUCT_NAME, 
          P.SELLING_PRICE,
          P.STATUS, -- [추가]
          D.DISCOUNT_RATE, 
          D.DISCOUNT_PRICE, 
          (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL,
          (SELECT LISTAGG(D.DEVICE_NAME, ', ') WITHIN GROUP (ORDER BY D.DEVICE_NAME) 
           FROM EaGCart_Product_Devices PD 
           JOIN EaGCart_Devices D ON PD.DEVICE_CODE = D.DEVICE_CODE 
           WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE) AS DEVICES,
          (SELECT LISTAGG(C.CATEGORY_NAME, ', ') WITHIN GROUP (ORDER BY C.CATEGORY_NAME) 
           FROM EaGCart_Product_Categories PC 
           JOIN EaGCart_Categories C ON PC.CATEGORY_CODE = C.CATEGORY_CODE 
           WHERE PC.PRODUCT_CODE = P.PRODUCT_CODE) AS CATEGORIES
        FROM EaGCart_Products P
        JOIN (
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
        -- [수정] 품절 포함
        WHERE P.STATUS IN ('판매중', '품절')
        ORDER BY D.DISCOUNT_RATE DESC, P.REGISTRATION_DATE DESC
      ) WHERE ROWNUM <= 10
    `;

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => {
      let salePrice = null;
      let discountRate = null;

      if (row.DISCOUNT_PRICE) {
        salePrice = row.DISCOUNT_PRICE;
        discountRate = Math.round(
          ((row.SELLING_PRICE - row.DISCOUNT_PRICE) / row.SELLING_PRICE) * 100
        );
      } else if (row.DISCOUNT_RATE) {
        discountRate = row.DISCOUNT_RATE;
        salePrice = Math.floor(
          row.SELLING_PRICE * (1 - row.DISCOUNT_RATE / 100)
        );
      }

      return {
        code: row.PRODUCT_CODE,
        name: row.PRODUCT_NAME,
        price: row.SELLING_PRICE,
        salePrice: salePrice,
        discountRate: discountRate,
        thumbnail: row.THUMBNAIL,
        devices: row.DEVICES,
        categories: row.CATEGORIES,
        status: row.STATUS, // [추가]
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// 통합 필터 검색 기능
async function getProductsByFilter(filterType, filterValue) {
  let connection;
  try {
    connection = await db.getConnection();

    // [수정] 품절 포함
    let whereClause = "WHERE P.STATUS IN ('판매중', '품절') ";
    let binds = {};

    if (filterType === "category") {
      whereClause += `
        AND EXISTS (
          SELECT 1 FROM EaGCart_Product_Categories PC 
          WHERE PC.PRODUCT_CODE = P.PRODUCT_CODE AND PC.CATEGORY_CODE = :filterValue
        )
      `;
      binds.filterValue = filterValue;
    } else if (filterType === "device") {
      whereClause += `
        AND EXISTS (
          SELECT 1 FROM EaGCart_Product_Devices PD 
          WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE AND PD.DEVICE_CODE = :filterValue
        )
      `;
      binds.filterValue = filterValue;
    } else if (filterType === "search") {
      whereClause += `
        AND (LOWER(P.PRODUCT_NAME) LIKE '%' || :filterValue || '%')
      `;
      binds.filterValue = filterValue.toLowerCase();
    }

    const sql = `
      SELECT 
        P.PRODUCT_CODE, 
        P.PRODUCT_NAME, 
        P.SELLING_PRICE,
        P.STATUS, -- [추가]
        D.DISCOUNT_RATE, 
        D.DISCOUNT_PRICE, 
        (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1) AS THUMBNAIL,
        (SELECT LISTAGG(D.DEVICE_NAME, ', ') WITHIN GROUP (ORDER BY D.DEVICE_NAME) 
         FROM EaGCart_Product_Devices PD 
         JOIN EaGCart_Devices D ON PD.DEVICE_CODE = D.DEVICE_CODE 
         WHERE PD.PRODUCT_CODE = P.PRODUCT_CODE) AS DEVICES,
        (SELECT LISTAGG(C.CATEGORY_NAME, ', ') WITHIN GROUP (ORDER BY C.CATEGORY_NAME) 
         FROM EaGCart_Product_Categories PC 
         JOIN EaGCart_Categories C ON PC.CATEGORY_CODE = C.CATEGORY_CODE 
         WHERE PC.PRODUCT_CODE = P.PRODUCT_CODE) AS CATEGORIES
      FROM EaGCart_Products P
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
      ${whereClause}
      ORDER BY P.REGISTRATION_DATE DESC
    `;

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => {
      let salePrice = null;
      let discountRate = null;

      if (row.DISCOUNT_PRICE) {
        salePrice = row.DISCOUNT_PRICE;
        discountRate = Math.round(
          ((row.SELLING_PRICE - row.DISCOUNT_PRICE) / row.SELLING_PRICE) * 100
        );
      } else if (row.DISCOUNT_RATE) {
        discountRate = row.DISCOUNT_RATE;
        salePrice = Math.floor(
          row.SELLING_PRICE * (1 - row.DISCOUNT_RATE / 100)
        );
      }

      return {
        code: row.PRODUCT_CODE,
        name: row.PRODUCT_NAME,
        price: row.SELLING_PRICE,
        salePrice: salePrice,
        discountRate: discountRate,
        thumbnail: row.THUMBNAIL,
        devices: row.DEVICES,
        categories: row.CATEGORIES,
        status: row.STATUS, // [추가]
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// [신규] 이름 조회 헬퍼 (타이틀용)
async function getNameByCode(type, code) {
  let connection;
  try {
    connection = await db.getConnection();
    const tableName =
      type === "device" ? "EaGCart_Devices" : "EaGCart_Categories";
    const colName = type === "device" ? "DEVICE_NAME" : "CATEGORY_NAME";
    const colCode = type === "device" ? "DEVICE_CODE" : "CATEGORY_CODE";

    const sql = `SELECT ${colName} FROM ${tableName} WHERE ${colCode} = :code`;
    const result = await connection.execute(sql, { code: code });
    return result.rows.length > 0 ? result.rows[0][0] : code;
  } finally {
    if (connection) await connection.close();
  }
}

// [신규] 실시간 재고 조회
async function getProductStock(code) {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT CURRENT_STOCK FROM EaGCart_Products WHERE PRODUCT_CODE = :code`,
      { code }
    );
    if (result.rows.length > 0) return result.rows[0][0]; // 재고 수량 반환
    return 0;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getDevices,
  getCategories,
  createProduct,
  getProductList,
  getProductByCode,
  getProductDetail,
  updateProduct,
  addTag,
  updateTag,
  deleteTag,
  searchProducts,
  searchProductsPublic,
  getMainProductList,
  getDiscountedProductList,
  getProductsByFilter,
  getProductStock,
  getNameByCode,
};

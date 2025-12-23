const db = require("../config/db");
const oracledb = require("oracledb");

// 리뷰 작성을 위한 상품 정보 조회 (기존)
async function getProductForReview(productCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
        SELECT PRODUCT_NAME, 
               (SELECT IMAGE_PATH FROM EaGCart_Product_Images WHERE PRODUCT_CODE = P.PRODUCT_CODE AND IMAGE_SEQUENCE = 1 AND ROWNUM = 1) AS THUMBNAIL
        FROM EaGCart_Products P
        WHERE PRODUCT_CODE = :code
    `;
    const result = await connection.execute(sql, { code: productCode });

    if (result.rows.length > 0) {
      return {
        name: result.rows[0][0],
        image: result.rows[0][1],
      };
    }
    return null;
  } finally {
    if (connection) await connection.close();
  }
}

// 리뷰 및 이미지 저장 (기존)
async function createReview(reviewData, files) {
  let connection;
  try {
    connection = await db.getConnection();

    const reviewCode = "REV" + Date.now();

    const insertReviewSql = `
        INSERT INTO EaGCart_Reviews (
            REVIEW_CODE, PRODUCT_CODE, USER_CODE, TITLE, RATING, CONTENT, 
            REGISTRATION_DATE, LAST_MODIFIED_DATE, STATUS
        ) VALUES (
            :rCode, :pCode, :uCode, :title, :rating, :content, 
            SYSDATE, SYSDATE, 'ACTIVE'
        )
    `;

    await connection.execute(
      insertReviewSql,
      {
        rCode: reviewCode,
        pCode: reviewData.productCode,
        uCode: reviewData.userCode,
        title: reviewData.title,
        rating: reviewData.rating,
        content: reviewData.content,
      },
      { autoCommit: false }
    );

    if (files && files.length > 0) {
      const insertImageSql = `
            INSERT INTO EaGCart_Review_Images (
                REVIEW_CODE, IMAGE_SEQUENCE, IMAGE_PATH
            ) VALUES (
                :rCode, :seq, :path
            )
        `;

      for (let i = 0; i < files.length; i++) {
        const imagePath =
          "/" + files[i].path.replace(/\\/g, "/").replace("public/", "");

        await connection.execute(
          insertImageSql,
          {
            rCode: reviewCode,
            seq: i + 1,
            path: imagePath,
          },
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

// 사용자 리뷰 목록 조회 (기존)
async function getUserReviews(userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
            SELECT 
                R.REVIEW_CODE,
                R.TITLE,
                R.RATING,
                R.CONTENT,
                TO_CHAR(R.REGISTRATION_DATE, 'YYYY-MM-DD') AS REG_DATE,
                P.PRODUCT_NAME,
                P.SELLING_PRICE,
                (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI 
                 WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1 AND ROWNUM = 1) AS THUMBNAIL
            FROM EaGCart_Reviews R
            JOIN EaGCart_Products P ON R.PRODUCT_CODE = P.PRODUCT_CODE
            WHERE R.USER_CODE = :userCode AND R.STATUS = 'ACTIVE'
            ORDER BY R.REGISTRATION_DATE DESC
        `;

    const result = await connection.execute(
      sql,
      { userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      code: row.REVIEW_CODE,
      title: row.TITLE,
      rating: row.RATING,
      content: row.CONTENT,
      date: row.REG_DATE,
      productName: row.PRODUCT_NAME,
      price: row.SELLING_PRICE,
      thumbnail: row.THUMBNAIL,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 리뷰 삭제 (기존)
async function deleteReview(reviewCode, userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
            UPDATE EaGCart_Reviews 
            SET STATUS = 'DELETED' 
            WHERE REVIEW_CODE = :rCode AND USER_CODE = :uCode
        `;
    await connection.execute(
      sql,
      { rCode: reviewCode, uCode: userCode },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

// [수정됨] 상품 상세 페이지용 리뷰 목록 조회 (다중 이미지, 수정일 반영)
async function getProductReviews(productCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
            SELECT 
                R.REVIEW_CODE,
                R.RATING,
                R.TITLE,
                R.CONTENT,
                -- 수정일이 있으면 수정일, 없으면 등록일을 표시
                TO_CHAR(COALESCE(R.LAST_MODIFIED_DATE, R.REGISTRATION_DATE), 'YYYY-MM-DD') AS DISPLAY_DATE,
                M.USER_NAME AS NICKNAME,
                REGEXP_REPLACE(M.USER_NAME, '(.{1})(.*)(.{1})', '\\1*\\3') AS MASKED_NAME,
                -- 여러 이미지를 쉼표로 구분하여 가져오기
                (SELECT LISTAGG(IMAGE_PATH, ',') WITHIN GROUP (ORDER BY IMAGE_SEQUENCE) 
                 FROM EaGCart_Review_Images RI 
                 WHERE RI.REVIEW_CODE = R.REVIEW_CODE) AS IMAGES
            FROM EaGCart_Reviews R
            JOIN EaGCart_Members M ON R.USER_CODE = M.USER_CODE
            WHERE R.PRODUCT_CODE = :code AND R.STATUS = 'ACTIVE'
            ORDER BY R.REGISTRATION_DATE DESC
        `;

    const result = await connection.execute(
      sql,
      { code: productCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      rating: row.RATING,
      title: row.TITLE,
      content: row.CONTENT,
      date: row.DISPLAY_DATE,
      nickname: row.MASKED_NAME || row.NICKNAME,
      // 쉼표로 구분된 문자열을 배열로 변환 (이미지가 없으면 빈 배열)
      images: row.IMAGES ? row.IMAGES.split(",") : [],
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 리뷰 상세 조회 (수정용) - 필요한 경우 유지
async function getReviewDetail(reviewCode, userCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
            SELECT 
                R.REVIEW_CODE, R.PRODUCT_CODE, R.TITLE, R.RATING, R.CONTENT,
                P.PRODUCT_NAME,
                (SELECT IMAGE_PATH FROM EaGCart_Product_Images PI 
                 WHERE PI.PRODUCT_CODE = P.PRODUCT_CODE AND PI.IMAGE_SEQUENCE = 1 AND ROWNUM = 1) AS THUMBNAIL
            FROM EaGCart_Reviews R
            JOIN EaGCart_Products P ON R.PRODUCT_CODE = P.PRODUCT_CODE
            WHERE R.REVIEW_CODE = :rCode AND R.USER_CODE = :uCode
        `;

    const result = await connection.execute(
      sql,
      { rCode: reviewCode, uCode: userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    const imgSql = `
            SELECT IMAGE_PATH FROM EaGCart_Review_Images 
            WHERE REVIEW_CODE = :rCode ORDER BY IMAGE_SEQUENCE
        `;
    const imgResult = await connection.execute(
      imgSql,
      { rCode: reviewCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const images = imgResult.rows.map((r) => r.IMAGE_PATH);

    return {
      code: row.REVIEW_CODE,
      productCode: row.PRODUCT_CODE,
      productName: row.PRODUCT_NAME,
      productImage: row.THUMBNAIL,
      title: row.TITLE,
      rating: row.RATING,
      content: row.CONTENT,
      images: images,
    };
  } finally {
    if (connection) await connection.close();
  }
}

// 리뷰 수정
async function updateReview(reviewCode, userCode, updateData, files) {
  let connection;
  try {
    connection = await db.getConnection();

    const updateSql = `
            UPDATE EaGCart_Reviews
            SET TITLE = :title, RATING = :rating, CONTENT = :content, LAST_MODIFIED_DATE = SYSDATE
            WHERE REVIEW_CODE = :rCode AND USER_CODE = :uCode
        `;

    await connection.execute(
      updateSql,
      {
        title: updateData.title,
        rating: updateData.rating,
        content: updateData.content,
        rCode: reviewCode,
        uCode: userCode,
      },
      { autoCommit: false }
    );

    if (files && files.length > 0) {
      await connection.execute(
        `DELETE FROM EaGCart_Review_Images WHERE REVIEW_CODE = :rCode`,
        { rCode: reviewCode },
        { autoCommit: false }
      );

      const insertImageSql = `
                INSERT INTO EaGCart_Review_Images (
                    REVIEW_CODE, IMAGE_SEQUENCE, IMAGE_PATH
                ) VALUES (
                    :rCode, :seq, :path
                )
            `;

      for (let i = 0; i < files.length; i++) {
        const imagePath =
          "/" + files[i].path.replace(/\\/g, "/").replace("public/", "");
        await connection.execute(
          insertImageSql,
          {
            rCode: reviewCode,
            seq: i + 1,
            path: imagePath,
          },
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

// [수정됨] 관리자용 전체 리뷰 목록 조회 (작성자 ID 추가)
async function getAllReviews(searchFilter) {
  let connection;
  try {
    connection = await db.getConnection();

    let sql = `
            SELECT 
                R.REVIEW_CODE,
                R.TITLE,
                R.CONTENT,
                R.STATUS,
                TO_CHAR(R.REGISTRATION_DATE, 'YYYY-MM-DD') AS REG_DATE,
                M.USER_NAME, -- 이름
                M.USER_ID,   -- 아이디
                P.PRODUCT_NAME
            FROM EaGCart_Reviews R
            JOIN EaGCart_Members M ON R.USER_CODE = M.USER_CODE
            JOIN EaGCart_Products P ON R.PRODUCT_CODE = P.PRODUCT_CODE
            WHERE 1=1
        `;

    const binds = {};

    if (searchFilter) {
      if (searchFilter.startDate && searchFilter.endDate) {
        sql += ` AND R.REGISTRATION_DATE BETWEEN TO_DATE(:startDate, 'YYYY-MM-DD') AND TO_DATE(:endDate, 'YYYY-MM-DD') + 0.99999`;
        binds.startDate = searchFilter.startDate;
        binds.endDate = searchFilter.endDate;
      }
      if (searchFilter.keyword) {
        sql += ` AND (R.REVIEW_CODE LIKE '%' || :keyword || '%' OR R.TITLE LIKE '%' || :keyword || '%' OR M.USER_NAME LIKE '%' || :keyword || '%' OR M.USER_ID LIKE '%' || :keyword || '%')`;
        binds.keyword = searchFilter.keyword;
      }
    }

    sql += ` ORDER BY R.REGISTRATION_DATE DESC`;

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => ({
      code: row.REVIEW_CODE,
      title: row.TITLE,
      content: row.CONTENT,
      status: row.STATUS,
      date: row.REG_DATE,
      // [수정] 이름(아이디) 형식으로 반환
      author: `${row.USER_NAME} (${row.USER_ID})`,
      productName: row.PRODUCT_NAME,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// [신규] 리뷰 상태 변경 (관리자용)
async function updateReviewStatus(reviewCode, status) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `UPDATE EaGCart_Reviews SET STATUS = :status WHERE REVIEW_CODE = :code`;
    await connection.execute(
      sql,
      { status: status, code: reviewCode },
      { autoCommit: true }
    );
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

// [수정됨] 관리자용 리뷰 상세 조회 (작성자 ID 추가)
async function getReviewDetailForAdmin(reviewCode) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
            SELECT 
                R.REVIEW_CODE, R.TITLE, R.CONTENT, R.RATING, R.STATUS,
                TO_CHAR(R.REGISTRATION_DATE, 'YYYY-MM-DD HH24:MI') AS REG_DATE,
                M.USER_NAME,
                M.USER_ID,
                P.PRODUCT_NAME,
                (SELECT LISTAGG(IMAGE_PATH, ',') WITHIN GROUP (ORDER BY IMAGE_SEQUENCE) 
                 FROM EaGCart_Review_Images RI 
                 WHERE RI.REVIEW_CODE = R.REVIEW_CODE) AS IMAGES
            FROM EaGCart_Reviews R
            JOIN EaGCart_Members M ON R.USER_CODE = M.USER_CODE
            JOIN EaGCart_Products P ON R.PRODUCT_CODE = P.PRODUCT_CODE
            WHERE R.REVIEW_CODE = :rCode
        `;

    const result = await connection.execute(
      sql,
      { rCode: reviewCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    return {
      code: row.REVIEW_CODE,
      title: row.TITLE,
      content: row.CONTENT,
      rating: row.RATING,
      status: row.STATUS,
      date: row.REG_DATE,
      // [수정] 이름(아이디)
      author: `${row.USER_NAME} (${row.USER_ID})`,
      productName: row.PRODUCT_NAME,
      images: row.IMAGES ? row.IMAGES.split(",") : [],
    };
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getProductForReview,
  createReview,
  getUserReviews,
  deleteReview,
  getProductReviews,
  getReviewDetail,
  updateReview,
  getAllReviews,
  updateReviewStatus,
  getReviewDetailForAdmin,
};

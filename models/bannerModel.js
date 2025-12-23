const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 배너 목록 조회
async function getBanners() {
  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      `SELECT BANNER_NUM, IMAGE_PATH, LINK_TYPE, LINK_CONTENT, DISPLAY_ORDER 
       FROM EaGCart_Banner 
       ORDER BY DISPLAY_ORDER ASC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      bannerNum: row.BANNER_NUM,
      imagePath: row.IMAGE_PATH,
      linkType: row.LINK_TYPE,
      linkContent: row.LINK_CONTENT,
      displayOrder: row.DISPLAY_ORDER,
    }));
  } catch (err) {
    console.error("[Model] getBanners Error:", err);
    throw err;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

// 2. 배너 전체 교체 (Transaction: Delete All -> Insert All)
async function replaceAllBanners(bannerList) {
  let connection;
  try {
    connection = await db.getConnection();

    // 1단계: 기존 데이터 전체 삭제
    await connection.execute(`DELETE FROM EaGCart_Banner`, [], {
      autoCommit: false,
    });

    // 2단계: 새 데이터 일괄 삽입
    if (bannerList.length > 0) {
      const sql = `
        INSERT INTO EaGCart_Banner (
          BANNER_NUM, IMAGE_PATH, LINK_TYPE, LINK_CONTENT, DISPLAY_ORDER
        ) VALUES (
          :num, :path, :linkType, :linkContent, :orderNum
        )
      `;

      // 바인드 변수 매핑
      const binds = bannerList.map((banner) => ({
        num: banner.num, // 1, 2, 3...
        path: banner.imagePath,
        linkType: banner.linkType,
        linkContent: banner.linkContent,
        orderNum: banner.order, // 1, 2, 3...
      }));

      const options = {
        autoCommit: false,
        bindDefs: {
          num: { type: oracledb.NUMBER },
          path: { type: oracledb.STRING, maxSize: 255 },
          linkType: { type: oracledb.STRING, maxSize: 20 },
          linkContent: { type: oracledb.STRING, maxSize: 500 },
          orderNum: { type: oracledb.NUMBER },
        },
      };

      await connection.executeMany(sql, binds, options);
    }

    // 3단계: 커밋
    await connection.commit();
    console.log(
      `[Model] Replaced all banners. Total count: ${bannerList.length}`
    );
    return true;
  } catch (err) {
    console.error("[Model] replaceAllBanners Error:", err);
    if (connection) {
      try {
        await connection.rollback();
      } catch (e) {}
    }
    throw err;
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

module.exports = {
  getBanners,
  replaceAllBanners,
};

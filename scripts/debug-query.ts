/**
 * Debug script to check mysql2 return format
 */

import { query } from '../src/lib/db'

async function debugQuery() {
  const sql = `
    SELECT
      bc.bkid,
      bc.loginid,
      bc.bcname,
      bc.subdom
    FROM buscomps bc
    INNER JOIN bkmasters bk ON bc.bkid = bk.bkid
    WHERE bc.loginid IS NOT NULL
      AND bk.cognito_credentials IS NOT NULL
    ORDER BY bc.loginid ASC
  `

  const rows = await query(sql)
  console.log('Raw query result:')
  console.log(JSON.stringify(rows, null, 2))
}

debugQuery()

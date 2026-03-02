import type { Request, Response, NextFunction } from 'express'

const API_TOKEN = process.env.CORE_API_TOKEN

/**
 * Core API 認証ミドルウェア
 *
 * CORE_API_TOKEN が設定されている場合:
 *   Authorization: Bearer <token> ヘッダーで検証
 *
 * 設定されていない場合:
 *   開発モードとして警告を出しつつ通過（起動時に警告表示）
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // /health はヘルスチェック用に認証不要
  if (req.path === '/health') return next()

  if (!API_TOKEN) {
    // 開発モード: トークン未設定なら通過（起動時に警告済み）
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required (Bearer <token>)' })
  }

  const token = authHeader.slice(7)
  if (token !== API_TOKEN) {
    return res.status(403).json({ error: 'Invalid API token' })
  }

  next()
}

export function checkAuthConfig() {
  if (!API_TOKEN) {
    console.warn('[AUTH] ⚠️  CORE_API_TOKEN is not set — API is unauthenticated!')
    console.warn('[AUTH] ⚠️  Set CORE_API_TOKEN in .env for production use')
  } else {
    console.log('[AUTH] ✅ API token authentication enabled')
  }
}

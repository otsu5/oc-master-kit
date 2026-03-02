const parse = (v?: string) => new Set(v?.split(',').map(s => s.trim()).filter(Boolean) ?? [])
const admins  = parse(process.env.TELEGRAM_ADMIN_IDS)
const allowed = parse(process.env.TELEGRAM_ALLOWED_IDS)

export const isAdmin   = (id: number | string) => admins.has(String(id))
export const isAllowed = (id: number | string) => {
  if (allowed.size === 0) return isAdmin(id)
  return allowed.has(String(id)) || isAdmin(id)
}

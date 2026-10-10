export async function api<T>(path: string, data?: unknown): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), path.includes('/agent/chat') ? 330000 : 15000)
  try {
    const response = await fetch('/api' + path, { method: data === undefined ? 'GET' : 'POST', headers: {'Content-Type': 'application/json'}, body: data === undefined ? undefined : JSON.stringify(data), signal: controller.signal })
    const json = await response.json()
    if (!response.ok) throw new Error(typeof json.detail === 'string' ? json.detail : '输入内容不完整或格式错误，请检查后重试')
    return json as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('请求超时，请检查后端服务后重试')
    throw error
  } finally { clearTimeout(timeout) }
}

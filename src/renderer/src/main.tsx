import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveLocale, translate } from '@shared/i18n'
import App from './App'
import './styles.css'

// 设置加载前先按系统语言确定文档语言，避免首屏用错字形
const initialLocale = resolveLocale('auto', navigator.language)
document.documentElement.lang = initialLocale === 'ja' ? 'ja' : 'zh-CN'
document.title = translate(initialLocale, 'app.name')

const container = document.getElementById('root')
if (!container) throw new Error('缺少根节点')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)

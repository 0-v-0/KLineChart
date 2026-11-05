import { describe, expect, it } from 'vitest'

import type { Locales } from '../../Options'
import enUS from './en-US'
import zhCN from './zh-CN'
import { getSupportedLocales, i18n, registerLocale } from './index'

describe('i18n', () => {
  it('returns the text of a registered locale', () => {
    expect(i18n('open', 'zh-CN')).toBe(zhCN.open)
    expect(i18n('open', 'en-US')).toBe(enUS.open)
  })

  it('falls back to the key instead of throwing when the locale is not registered', () => {
    expect(() => {
      i18n('open', 'ja-JP')
    }).not.toThrow()
    expect(i18n('open', 'ja-JP')).toBe('open')
    // 渲染路径会反复查询同一个未注册语言，返回值必须稳定
    expect(i18n('open', 'ja-JP')).toBe('open')
  })

  it('falls back to the key when a registered locale misses the key', () => {
    registerLocale('xx-XX', { open: 'OPEN' } as unknown as Locales)
    expect(getSupportedLocales()).toContain('xx-XX')
    expect(i18n('open', 'xx-XX')).toBe('OPEN')
    expect(i18n('close', 'xx-XX')).toBe('close')
  })
})

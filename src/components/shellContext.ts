'use client'
import { createContext } from 'react'

// True inside ProductShell: the shell owns the navigation, so the per-page
// <SiteNav /> renders nothing there.
export const ShellContext = createContext(false)

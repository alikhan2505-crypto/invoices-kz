import { NextRequest } from 'next/server'
import { verifyPlannerCookie, type PlannerSessionPayload } from './plannerSession'

// __Host- закреплённые куки требуют Secure и не работают на голом http (то
// есть на localhost при локальной разработке) -- поэтому префикс и флаг
// secure включены только в проде. Оба места, где кука ставится/читается,
// должны использовать одно и то же имя, отсюда общий экспорт.
export const PLANNER_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-planner_session' : 'planner_session'

// Тот же union-контракт {error,status}, что уже использует requireAdmin() в
// src/lib/salonSites/adminAuth.ts -- каждый маршрут планировщика копирует
// один и тот же guard-паттерн, что и весь остальной код этого проекта.
export async function requirePlannerSession(
  req: NextRequest
): Promise<PlannerSessionPayload | { error: string; status: number }> {
  const token = req.cookies.get(PLANNER_COOKIE_NAME)?.value
  if (!token) return { error: 'Unauthorized', status: 401 }

  const session = verifyPlannerCookie(token)
  if (!session) return { error: 'Unauthorized', status: 401 }

  return session
}

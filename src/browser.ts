import { Observable } from './observable.js'

/**
 * Creates an observable from DOM events.
 *
 * @param target The event target (Element, Document, Window, etc)
 * @param eventName The name of the event to listen for
 * @param options Optional event listener options
 * @return Observable that emits events when they occur
 */
export const fromEvent = <K extends keyof HTMLElementEventMap>(
  target: EventTarget,
  eventName: K,
  options?: boolean | AddEventListenerOptions,
): Observable<HTMLElementEventMap[K]> => {
  return (sub) => {
    const handler = (e: any) => sub(e)
    target.addEventListener(eventName as string, handler, options)
    return () => target.removeEventListener(eventName as string, handler, options)
  }
}

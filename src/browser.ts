import { EventFor, EventNameFor, ListenerOptions } from '@lickle/dom'
import { Observable, Observer } from './observable.js'

export type { EventFor, EventNameFor, ListenerOptions }

/**
 * Creates an observable from DOM events.
 *
 * @param target The event target (Element, Document, Window, etc)
 * @param eventName The name of the event to listen for
 * @param options Optional event listener options
 * @return Observable that emits events when they occur
 */
export const fromDomEvent = <T extends EventTarget, K extends EventNameFor<T>>(
  target: T,
  eventName: K,
  options?: ListenerOptions,
): Observable<EventFor<T, K>> => {
  return (observer: Observer<EventFor<T, K>>) => {
    const handler = (e: any) => observer.next(e)
    target.addEventListener(eventName, handler, options)
    return () => target.removeEventListener(eventName, handler, options)
  }
}

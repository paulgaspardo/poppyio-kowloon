import { ConnectingAcceptor, ConnectingIntent, PeerIntent, MatchResult, ConnectingOffer, BasicIntent, Intent, PostingAcceptor, PostingOffer, HandlingIntent } from "./common.js";

import { parseOrigin, toCats, Cat, dispatch } from "./common-impl.js";

export { ModalRequest, ModalRequest as default }

/**
 * Allows a client to make a request to a poppy service
 */
class ModalRequest {

	private z: ZImpl

	/**
	 * The currently open request, if any
	 */
	static current?: ModalRequest;

	/**
	 * The DOM node under which to insert request-related elements, in particular
	 * the proxy iframe. Instead of setting this property directly, consider
	 * using the prepareProxy() method which also prepares an initial proxy iframe
	 * to work around some popup blockers (in particular Chrome on Android).
	 */
	static container?: Element;

	/**
	 * Prepared proxy iframe for the next request
	 * 
	 * Some popup blockers (in particular Chrome on Android and UC Browser) don't
	 * seem to like it when we create the proxy iframe window at the same time
	 * as opening the popup window. To work around this, we can create the iframes
	 * ahead of time; we keep track of the next iframe here.
	 * 
	 * To create the very first iframe, use the ModalRequest.prepareProxy() method.
	 */
	static nextProxy?: HTMLIFrameElement;

	/**
	 * The sandbox value to use for the proxy iframe, if not specified will be
	 * created with "allow-scripts allow-same-origin allow-forms allow-popups
	 * allow-pointer-lock"
	 */
	static sandbox?: string;

	/**
	 * Optional hack to allow older IE versions to work.
	 * 
	 * IE 10 and older builds of IE 11 (newer builds don't seem to have this
	 * problem) would not allow cross-document messages to be sent between popup
	 * windows on different domains.
	 * 
	 * A workaround was identified in this Stack Overflow answer where you
	 * first open a page on the same origin, and somehow that makes it
	 *  work: https://stackoverflow.com/a/36630058
	 * 
	 * (The answer uses "/" but it seems any page on the same origin will do)
	 */
	static ieHack?: string;

	/**
	 * Hack to allow working within sandboxed iframes (may conflict with CSP)
	 * 
	 * To prevent the popup from changing the location of the client page that
	 * opens it, it's opened using through sandboxed proxy iframe without the
	 * "allow-top-navigation" permission. Problems may arise if the client page
	 * is itself in a sandboxed iframe (for instance on JSBin or other similar
	 * services) which somehow makes it so the parent page can no longer close
	 * the popup.
	 * 
	 * The problem seems to be related to the fact that the code is not really
	 * part of the iframe's content window, the true parent of the popup. So as
	 * a workaround, we can inject JavaScript in a script tag directly into the
	 * proxy iframe making it unambiguously the popup's opener. This is not ideal
	 * and may not work depending on the server's Content Security Policy, so the
	 * default behavior if not specified is to only attempt the hack if we detect
	 * we are in a frame - but it may be disabled entirely by setting this to
	 * false.
	 */
	static useInlineScriptHack?: true | false | null | undefined;

	/**
	 * The URL of the service page to open in the popup. Optional, but a
	 * launcher must be set if not specified. (May also be specified as the
	 * parameter to the constructor)
	 */
	service?: string;

	/**
	 * URL or JavaScript function to use as a launcher if no service
	 * is specified.
	 * 
	 * A launcher allows the user to specify a service to use by some means.
	 * A default implementation is provided with the "Injected" module.
	 */
	launcher?: string | ((popup: Window, request: ModalRequest) => void);

	/**
	 * Modal overlay to show while the popup is open
	 * 
	 * This may be a hidden DOM node or a string with a CSS selector for a hidden
	 * DOM node - when it's time to display it its display CSS property will
	 * be set to "block", and then when it's time to hide it it'll be set to
	 * "display: none". Clicking on the node will cause the request to be
	 * cancelled.
	 * 
	 * May also be a function that is called when the overlay should be displayed
	 * with a single parameter, the current request. The function must return
	 * another function which will be called when it's time to close the overlay.
	 */
	overlay?: string|HTMLElement|((request: ModalRequest) => () => void);

	/**
	 * Set the (optional) container property and also create an initial proxy iframe
	 * for the first request. This is optional but recommended as some popup
	 * blockers may prevent the popup from showing when we create the iframe at
	 * the same time as opening the window.
	 * 
	 * @param container Optional container to use as the parent for request-related
	 *                  DOM nodes (in particular the proxy iframe)
	 */
	static prepareProxy(container?: HTMLElement|string) {
		if (container instanceof Element) {
			ModalRequest.container = container;
		} else if (typeof container === 'string') {
			let found = document.querySelector(container);
			if (found) {
				ModalRequest.container = found;
			}
		}
		if (!ModalRequest.nextProxy || !ModalRequest.nextProxy.contentWindow) {
			ModalRequest.nextProxy = createProxy();
		}
	}

	/**
	 * Create a request and optionally specify its service URL.
	 *
	 * @param service Service URL (optional, will open launcher if not specified)
	 */
	constructor(service?: string) {
		if (typeof service === 'string') {
			this.service = service;
		}
		this.z = createZImpl(this);
	}

	/**
	 * Open a poppy and attempt to exchange data through it
	 * 
	 * This method opens a popup window and in it loads the service, if specified,
	 * or launcher. The specified Matchers are presented to the service which can
	 * then select one of them it is compatible with and use it to perform an
	 * exchange. If no matchers are compatible, or the user closes the window,
	 * then the result will NotMatched object. If an exchange was completed, the result
	 * will be a Matched object.
	 * 
	 * Note that after open() resolves, the popup may still be open. The
	 * ModalRequest.closed promise will resolve after the popup is closed.
	 * 
	 * This method may only be invoked once.
	 * 
	 * @param matching 
	 * @returns 
	 */
	open(matching: BasicIntent|BasicIntent[]): Promise<MatchResult<any[]>>
	open<T>(matching: HandlingIntent<T>|HandlingIntent<T>[]): Promise<MatchResult<T>>
	open<T>(matching: HandlingIntent<T>|BasicIntent|(HandlingIntent<T>|BasicIntent)): Promise<MatchResult<T|any[]>>

	open(matching: HandlingIntent<any>|BasicIntent|(HandlingIntent<any>|BasicIntent)[]): Promise<MatchResult<unknown>> {
		return this.z.o(matching);
	}

	/**
	 * Cancel this request.
	 * 
	 * This closes the poppy immediately. If open() is in progress, then any
	 * running MatchHandler will be allowed to complete normally unless a
	 * rejectWith value is specified, in which case the open() promise will be
	 * rejected regardless of the state of the Match.
	 * 
	 * @param reason Optional value to reject the open() promise with
	 */
	cancel(rejectWith?: any): void {
		this.z.x(rejectWith);
	}

	/**
	 * The current state of the request. Starts 'created' before open is called,
	 * 'open' from when the popup is opened, and then 'complete' once the popup
	 * is closed
	 */
	get state(): 'created' | 'open' | 'complete' {
		return this.z.s();
	}

	/**
	 * Promise that resolves when the request is closed. Note this promise does
	 * not resolve if open() is never invoked.
	 */
	get closing(): Promise<void> {
		return this.z.c();
	}

}

interface ZImpl {
	o(matcging: any): Promise<MatchResult<unknown>>;
	s(): 'created' | 'open' | 'complete';
	x(reason?: any): void;
	c(): Promise<void>;
}

function createProxy() {
	let container = ModalRequest.container || document.body;
	let proxy = container.ownerDocument.createElement('iframe');
	proxy.style.display = 'none';
	let sandbox = ModalRequest.sandbox || 'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock';
	try {
		proxy.sandbox.value = sandbox;
	} catch (e) {
		(proxy as any).sandbox = sandbox;
	}
	container.appendChild(proxy);
	return proxy;
}

function createZImpl(this: void, request: ModalRequest): ZImpl {
	let resolveClosing: () => void;
	let closingPromise = new Promise<void>(resolve => resolveClosing = resolve);

	let resolveOpen: (result: MatchResult<any>) => void;
	let rejectOpen: (reason: any) => void;
	let openPromise = new Promise<MatchResult<any>>((resolve, reject) => {
		resolveOpen = resolve;
		rejectOpen = reject;
	});

	let state: 'created' | 'open' | 'complete' = 'created';
	let s = () => state;

	let proxy: HTMLIFrameElement | undefined;

	let unloadEvent: 'unload' | 'pagehide' | undefined;
	let onUnload = () => x();

	let closeOverlay: (()=>void)|undefined;

	let serviceOrigin: string = location.origin || parseOrigin(location.href);

	let cats: Cat<any>[];

	let o = <T> (matching: ConnectingAcceptor<T>|ConnectingOffer<T>|Array<ConnectingAcceptor<T>|ConnectingOffer<T>>) => {
		try {
			if (state !== 'created') {
				return Promise.reject(new Error('https://purl.org/pio/e/AlreadyOpened@$Version$'));
			}

			state = 'open';
			if (ModalRequest.current) {
				ModalRequest.current.cancel();
			}
			ModalRequest.current = request;

			cats = toCats(matching);

			proxy = ModalRequest.nextProxy;
			if (!proxy || !proxy.contentDocument) {
				console.warn('https://purl.org/pio/a/NoNextProxy');
				proxy = createProxy();
			}
			ModalRequest.nextProxy = undefined;
			Promise.resolve().then(() => {
				ModalRequest.nextProxy = createProxy();
			});
			const proxyWindow = proxy.contentWindow!;
			const proxyDocument = proxy.contentDocument!;

			unloadEvent = 'onpagehide' in proxyWindow ? 'pagehide' : 'unload';
			addEventListener(unloadEvent, onUnload);

			proxyWindow.addEventListener('https://purl.org/pio/a/Connect', (ev: any) => {
				try {
					let { origin, data, ports } = ev.detail;
					onConnect(origin, data, ports);
				} catch (e) {
					x(e);
				}
			});
			proxyWindow.addEventListener('https://purl.org/pio/a/Close', () => x());

			if (!dispatch(proxy, 'Open', { service: request.service, matching } )) {
				return openPromise;
			}

			if (!request.launcher && !request.service) {
				throw new Error('https://purl.org/pio/e/NothingToOpen@$Version$');
			}

			if (ModalRequest.useInlineScriptHack !== false && (ModalRequest.useInlineScriptHack || window !== top)) {
				let hackScript = proxyDocument.createElement('script');
				hackScript.textContent = 'pioi=1;(' + installInlineEventHandlers + ')(window)';
				proxyDocument.body.appendChild(hackScript);
				if (!(proxyWindow as any).pioi) {
					console.warn('https://purl.org/pio/a/InjectHackFailed');
					installInlineEventHandlers(proxyWindow as Window & { piop: Window|null|undefined});
				}
			} else {
				installInlineEventHandlers(proxyWindow as Window & { piop: Window|null|undefined});
			}

			let ieHack = !!(proxyDocument as any).documentMode && ModalRequest.ieHack;
			const popup = (proxyWindow as any).piop = proxyWindow.open(
				ieHack || 'about:blank',
				undefined,
				`scrollbars=1,resizable=1,`
				+ `width=${window.outerWidth-100},`
				+ `height=${window.outerHeight-120},`
				+ `left=${window.screenX+40},`
				+ `top=${window.screenY+40}`
			);
			if (!popup) {
				throw new Error('https://purl.org/pio/e/PopupBlocked@$Version$');
			}
			if (ieHack) {
				popup.location.replace('about:blank');
			}
			
			proxyWindow.addEventListener('https://purl.org/pio/a/ChangeLocation', (e: any) => {
				serviceOrigin = parseOrigin(e.detail, serviceOrigin);
			});

			let popupUrl = typeof request.service === 'string' ? request.service : typeof request.launcher === 'string' ? request.launcher : undefined;
			if (popupUrl) {
				dispatch(proxyWindow, 'ChangeLocation', popupUrl);
			} else if (typeof request.launcher === 'function') {
				request.launcher(popup, request);
			} else {
				throw new Error('https://purl.org/pio/e/NothingToOpen@$Version$');
			}

			let pollClosedInterval = setInterval(() => {
				let closed = true;
				try {
					closed = popup.closed;
				} catch (e) {
					// ignore
				}
				if (closed) {
					clearInterval(pollClosedInterval);
					x();
				}
			}, 150);
			
			if (request.overlay) {
				if (typeof request.overlay === 'function') {
					closeOverlay = request.overlay(request);
					if (typeof closeOverlay !== 'function') {
						throw new Error('https://purl.org/pio/e/OverlayFunctionDidntReturnFunction@$Version$');
					}
				} else {
					let overlayNode: Element | HTMLElement | SVGElement | null | undefined;
					if (typeof request.overlay === 'string') {
						overlayNode = document.querySelector(request.overlay);
						if (!overlayNode) {
							throw new Error('https://purl.org/pio/e/OverlayNotFound@$Version$')
						}
					} else if (request.overlay instanceof Element) {
						overlayNode = request.overlay;
					} else {
						throw new Error('https://purl.org/pio/e/OverlayNotAStringOrHTMLElement@$Version$');
					}
					if (overlayNode) {
						let onKeyDown = (ev: KeyboardEvent) => {
							if (ev.key === 'Escape' || ev.key === 'Esc') {
								x();
							}
						};
						let onClick = (ev: Event) => {
							let shouldDismissOnClick: (at: Element) => boolean | null = at => {
								let attributeValue = at.getAttribute('data-dismiss-on-click');
								if (attributeValue) {
									return attributeValue.trim() === 'true';
								}
								return at === overlayNode || (at.parentElement && shouldDismissOnClick(at.parentElement));
							}
							if (shouldDismissOnClick(ev.target as HTMLElement|SVGElement)) {
								x();
							}
						};
						if ('style' in overlayNode) {
							let style = overlayNode.style;
							style.display = 'block';
							document.addEventListener('keydown', onKeyDown);
							overlayNode.addEventListener('click', onClick);
							closeOverlay = () => {
								document.removeEventListener('keydown', onKeyDown);
								style.display = 'none';
								overlayNode!.removeEventListener('click', onClick);
							};
						}
					}
				}
			}
			let onCrossDocumentMessage = (m: MessageEvent) => {
				let body = m.data?.['https://purl.org/pio/a/ServiceMessage'];
				if (!Array.isArray(body)) {
					return;
				}
				let fromPopup = m.source && (m.source as Window).top === popup;
				if (body[0] === 'close') {
					if (fromPopup || popup.closed) {
						x();
					}
					return;
				}
				if (!fromPopup || serviceOrigin !== m.origin) {
					return;
				}
				if (body[0] === 'change-origin') {
					if (typeof body[1] !== 'string') {
						throw new Error('https://purl.org/pio/e/MissingOrigin@$Version$');
					}
					serviceOrigin = body[1];
					return;
				}
				if (body[0] !== 'get-request') {
					throw new Error('https://purl.org/pio/e/UnrecognizedMessage@$Version$');
				}
				let connectChannel = new MessageChannel;
				popup.postMessage({
					'https://purl.org/pio/a/ClientMessage': [
						'request',
						cats.map(({ side, having, form }) => ({ side, having, form }))
					]
				}, m.origin, [connectChannel.port1]);
				connectChannel.port2.onmessage = ev => {
					try {
						dispatch(proxyWindow, 'Connect', { data: ev.data, ports: ev.ports, origin: m.origin });
					} catch (ex) {
						x(ex);
					}
				};
			};      
			proxyWindow.addEventListener('message', m => {
				try {
					onCrossDocumentMessage(m);
				} catch (e) {
					x(e);
				}
			});
		} catch (e) {
			rejectOpen(e);
		}
		return openPromise;
	}

	let statusPort: MessagePort|undefined;
	let exchangePort: MessagePort|undefined;
	let onConnect = (origin: string, data: any, ports: readonly MessagePort[]) => {
		if (exchangePort) {
			throw new Error('https://purl.org/pio/e/AlreadyConnected@$Version$');
		}
		if (!Array.isArray(data) || data[0] !== 'connect') {
			throw new Error('https://purl.org/pio/e/InvalidConnectMessage@$Version$');
		}
		if (ports.length !== 2) {
			throw new Error('https://purl.org/pio/e/InvalidConnectMessage@$Version$');
		}
		let [_, side, form, having] = data;
		if (side !== 'accepting' && side !== 'offering') {
			throw new Error('https://purl.org/pio/e/InvalidConnectMessage@$Version$');
		}
		if (typeof form !== 'string') {
			throw new Error('https://purl.org/pio/e/InvalidConnectMessage@$Version$');
		}
		if (typeof having !== 'object') {
			throw new Error('https://purl.org/pio/e/InvalidConnectMessage@$Version$');
		}
		let peer: PeerIntent = {
			origin,
			side,
			form,
			having
		};
		let matchedCat: Cat<any>|undefined;
		for (let cat of cats) {
			if (cat.side === side) {
				continue;
			}
			if (cat.form !== form) {
				continue;
			}
			matchedCat = cat;
		}
		if (!matchedCat) {
			throw new Error('https://purl.org/pio/e/NoMatchingConnector@$Version$');
		}
		exchangePort = ports[0];
		statusPort = ports[1];
		statusPort.onmessage = ev => {
			if (Array.isArray(ev) && ev.data[0] === 'done') {
				resolveClosing();
			}
		};
		matchedCat.connect(exchangePort, peer, closingPromise).then(
			value => {
				statusPort!.postMessage(['done']);
				resolveOpen({ matched: peer, value })
			},
			x
		);
	};

	let x = (reason?: any) => {
		if (state === 'complete') {
			return;
		}
		state = 'complete';
		if (ModalRequest.current === request) {
			ModalRequest.current = undefined;
		}
		if (proxy) {
			if (proxy.contentWindow) {
				(proxy.contentWindow as any).pioc();
			}
			proxy.parentNode?.removeChild(proxy);
		}
		resolveClosing();
		if (reason) {
			rejectOpen(reason);
		} else if (!exchangePort) {
			resolveOpen({ matched: null });
		}
		if (closeOverlay) {
			closeOverlay();
		}
		if (unloadEvent) {
			removeEventListener(unloadEvent, onUnload);
		}
		if (exchangePort) {
			exchangePort.close();
		}
		if (statusPort) {
			statusPort.postMessage(['done']);
			statusPort.close();
		}
	};

	return { o, s, x, c: () => closingPromise };
}

function installInlineEventHandlers(proxyWindow: any) {
	proxyWindow.pioc = () => {
		try {
			if (proxyWindow.piop) {
				proxyWindow.piop.close();
			}
		} catch (e) {
			// ignore
		}
	}
	proxyWindow.addEventListener('https://purl.org/pio/a/Close', () => proxyWindow.pioc());
	proxyWindow.addEventListener('https://purl.org/pio/a/ChangeLocation', (e: any) => proxyWindow.piop?.location.replace(e.detail));
}

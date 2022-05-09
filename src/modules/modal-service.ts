import { Intent, PeerIntent, MatchResult, BasicIntent, PostingIntent, DataArray } from "./common.js";

import { toCats, Cat, dispatch } from "./common-impl.js";

export { ModalService, ModalServiceRequest, ModalService as default };

/**
 * Allows a poppy service to handle requests from a client
 */
class ModalService {

	/**
	 * Close the service
	 * 
	 * Use this instead of window.close() to notify the client about the closing
	 * immediately (otherwise it will find out by polling to check the window
	 * status)
	 */
	static close() {
		top?.opener?.postMessage({
			'https://purl.org/pio/a/ServiceMessage': ['close']
		}, '*');
		window.close();
	}

	/**
	 * Notify the client of a change in the service origin
	 * 
	 * Clients only accept messages from the origin of the service loaded into
	 * the poppy. This method allows changing the origin before redirecting to
	 * a different service.
	 * 
	 * @param newOrigin 
	 * @returns 
	 */
	static changeOrigin(newOrigin: string) {
		if (!top) {
			window.close();
			return;
		}
		(top.opener || top).postMessage({
			'https://purl.org/pio/a/ServiceMessage': ['change-origin', newOrigin]
		}, '*');
	}

	/**
	 * Listen for a client request
	 * 
	 * This asynchronously waits for a client request and returns a promise that
	 * resolves to either the request (if one is detected) or undefined (after a
	 * timeout period of by default 1 second, the timeout parameter can change
	 * this)
	 * 
	 * This method doesn't open the request and may be called any number of times,
	 * and from any number of different pages, until request.open() is called.
	 * After that, the exchange will be complete.
	 * 
	 * @param timeout Optionally specify a timeout duration, the default if not is 1 second
	 */
	static getRequest(timeout?: number): Promise<ModalServiceRequest|undefined> {
		if (State.request) {
			return Promise.resolve(State.request);
		}
		if (!top) {
			return Promise.resolve(undefined);
		}
		if (!State.waiting) {
			State.waiting = {};
			(top.opener || top).postMessage({
				'https://purl.org/pio/a/ServiceMessage': ['get-request']
			}, '*');
			top.addEventListener('message', m => {
				if (top?.opener) {
					setInterval(() => {
						if (!top || !top.opener) {
							close();
						}
					}, 150);
				}
				if (State.request) {
					return;
				}
				if ((m.source as Window).top !== (top?.opener?.top || top)) {
					return;
				}
				let body = m.data?.['https://purl.org/pio/a/ClientMessage'];
				if (!Array.isArray(body)) {
					return;
				}
				if (body[0] !== 'request') {
					console.warn('Unrecognized message');
					return;
				}
				if (m.ports.length !== 1) {
					console.warn('Request message did not include exactly one port');
					return;
				}
				State.connectPort = m.ports[0];
				if (!Array.isArray(body[1])) {
					return;
				}
				let matching: PeerIntent[] = [];
				for (let match of body[1]) {
					if (!match) {
						continue;
					}
					if (match.side !== 'accepting' && match.side !== 'offering') {
						continue;
					}
					if (typeof match.form !== 'string') {
						continue;
					}
					matching.push({
						form: match.form,
						side: match.side,
						having: !!match.having && typeof match.having == 'object' ? match.having : {},
						origin: m.origin
					});
				}
				let req = State.request = {
					matching,
					open: openRequest
				};
				for (let key of Object.keys(State.waiting!)) {
					State.waiting![key](req);
				}
			});
		}
		return new Promise<ModalServiceRequest|undefined>(resolve => {
			let waitingKey = State.lastWaitingKey = (State.lastWaitingKey || 0) + 1;
			let timeoutPending = true;
			let timeoutId = setTimeout(
				() => {
					timeoutPending = false;
					finish(undefined)
				},
				typeof timeout === 'number' ? timeout : 1000
			);
			let finish = (req: ModalServiceRequest|undefined) => {
				if (timeoutPending) {
					clearTimeout(timeoutId);
				}
				delete State.waiting![waitingKey];
				resolve(req);
			}
			State.waiting![waitingKey] = finish;
		});
	}
	
	/**
	 * Low level interface allowing directly specifying the MessagePorts to use
	 * to perform the exchange 
	 * 
	 * @param side Side of the exchange
	 * @param form Form of the exchange 
	 * @param having Form-specific metadata
	 * @param exchangePort MessagePort to perform exchange over
	 * @param statusPort MessagePort to send ["done"] status once exchange is complete
	 */
	static connectDirectly(side: 'offering'|'accepting', form: string, having: object, exchangePort: MessagePort, statusPort: MessagePort) {
		if (!State.connectPort) {
			throw new Error('https://purl.org/pio/e/NoConnectPort@$Version$')
		}
		State.connectPort.postMessage(['connect', side, form, having], [exchangePort, statusPort]);
	}

}

/**
 * Request made by a client
 */
 interface ModalServiceRequest {

	/**
	 * Match options supported by the client
	 */
	matching: PeerIntent[];

	/**
	 * Performa data exchange with the client using one of the specified matchers.
	 * This method may only be invoked once.
	 * 
	 * @param matching One or more matchers that correspond to the client
	 *   matching list, to use to perform the exchange
	 */
	open(matching: BasicIntent|BasicIntent[]): Promise<MatchResult<DataArray>>
	open<T>(matching: PostingIntent<T>|PostingIntent<T>[]): Promise<MatchResult<T>>
	open<T>(matching: PostingIntent<T>|BasicIntent|(PostingIntent<T>|BasicIntent)[]): Promise<MatchResult<T|DataArray>>
}


class State {
	static lastWaitingKey: number;
	static waiting: {[key:string]:(request: ModalServiceRequest) => void} | undefined;
	static request: ModalServiceRequest|undefined;
	static connectPort: MessagePort;
	static opened: any;
}

function openRequest(matching: BasicIntent|BasicIntent[]): Promise<MatchResult<DataArray>>;
function openRequest<T>(matching: PostingIntent<T>|PostingIntent<T>[]): Promise<MatchResult<T>>;
function openRequest<T>(matching: PostingIntent<T>|BasicIntent|(PostingIntent<T>|BasicIntent)): Promise<MatchResult<T|DataArray>>;

function openRequest(matching: Intent|Intent[]): Promise<MatchResult<unknown>> {
	if (State.opened) {
		return Promise.reject(new Error('https://purl.org/pio/e/AlreadyOpened@$Version$'));
	}
	State.opened = 1;
	try {
		let peer: PeerIntent | undefined;
		let matchingCat: Cat<unknown> | undefined;
		for (let cat of toCats(matching)) {
			let oppositeSide = cat.side === 'accepting' ? 'offering' : 'accepting';
			for (let peerOption of State.request!.matching) {
				if (peerOption.side === oppositeSide && peerOption.form === cat.form) {
					peer = peerOption;
					matchingCat = cat;
				}
			}
		}
		if (!peer || !matchingCat) {
			return Promise.resolve({ matched: null });
		}
		let exchangeChannel = new MessageChannel;
		let statusChannel = new MessageChannel;
		let closePorts = () => {
			exchangeChannel.port2.close();
			statusChannel.port2.postMessage(['done']);
			statusChannel.port2.close();
		};
		ModalService.connectDirectly(matchingCat.side, matchingCat.form, matchingCat.having, exchangeChannel.port1, statusChannel.port1);
		let closingPromise = new Promise<void>(resolve => {
			statusChannel.port2.onmessage = ev => {
				if (Array.isArray(ev.data) && ev.data[0] === 'done') {
					resolve();
					closePorts();
				}
			};
			addEventListener('pagehide', () => {
				resolve();
				closePorts();
			});
		});
		return new Promise<MatchResult<unknown>>((resolve, reject) => {
			try {
				matchingCat!.connect(exchangeChannel.port2, peer!, closingPromise).then(
					value => {
						resolve({ matched: peer!, value })
						closePorts();
					},
					reason => {
						reject(reason);
						closePorts();
					}
				)
			} catch (e) {
				closePorts();
				throw e;
			}
		});
	} catch (e) {
		return Promise.reject(e);
	}
}

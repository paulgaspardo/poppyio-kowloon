// Common functions and types not part of the public API

import { Intent, ConnectingIntent, PeerIntent, BasicAcceptor, BasicOffer, PostingAcceptor, PeerOffer, PostingOffer, PeerAcceptor, DataArray } from "./common.js";

export function dispatch(target: Window|Element, kind: string, detail?: any): boolean {
	if (typeof CustomEvent === 'function') {
		return target.dispatchEvent(new CustomEvent('https://purl.org/pio/a/' + kind, { cancelable: true, bubbles: true, detail }));
	} else {
		let evt = ('document' in target ? target.document : target.ownerDocument).createEvent('CustomEvent');
		(evt as any).initCustomEvent('https://purl.org/pio/a/' + kind, true, true, detail);
		return target.dispatchEvent(evt);
	}
}


export function toCats(matching: Intent|Intent[]): Cat<unknown>[];
export function toCats<T>(matcing: ConnectingIntent<T>|PostingAcceptor<T>|Array<PostingAcceptor<T>|ConnectingIntent<T>>): Cat<T>[];

export function toCats(matching: Intent|Intent[]): Cat<unknown>[] {
	let cats : Cat<unknown>[] = [];
	for (let matcher of Array.isArray(matching) ? matching : [matching]) {
		if (!matcher || typeof matcher !== 'object') {
			throw new Error('https://purl.org/pio/e/MatcherNotAnObject@$Version$');
		}
		if (!!matcher.accepting === !!matcher.offering) {
			throw new Error('https://purl.org/pio/e/MatcherDoesNotHaveAcceptingXorOffering@$Version$');
		}
		let side: 'accepting' | 'offering' = matcher.accepting ? 'accepting' : 'offering';
		let connect: (port: MessagePort, matched: PeerIntent, closing: Promise<void>) => PromiseLike<unknown>;
		if ('connecting' in matcher && typeof matcher.connecting === 'function') {
			connect = matcher.connecting.bind(matcher);
		} else if (matcher.accepting) {
			connect = (port, matched, closing) => performRecv(matcher as BasicAcceptor|PostingAcceptor<unknown>, port, matched, closing);
		} else {
			connect = (port, matched, closing) => performSend(matcher as BasicOffer, port, matched, closing);
		}
		let formOrForms = (matcher.accepting || matcher.offering)!;
		for (let form of Array.isArray(formOrForms) ? formOrForms : [formOrForms]) {
			if (typeof form !== 'string') {
				throw new Error('https://purl.org/pio/e/MatcherFormNotAString@$Version$');
			}
			cats.push({ side, form, having: matcher.having || {}, connect });
		}
	}
	return cats;
}

export function parseOrigin(url: string, relativeTo?: string) : string {
	let match = url.match(/^[A-Za-z\+\.\-]+\:\/\/[^/]+/);
	if (!match) {
		if (relativeTo) return parseOrigin(relativeTo);
		return '';
	} else {
		return match[0];
	}
}

function arrayify(data: any): DataArray {
	let dataArray = [].concat(data === null || data === undefined ? [] : data) as unknown as DataArray;
	dataArray.raw = data;
	return dataArray;
}

function performSend(matcher: BasicOffer|PostingOffer<any>, port: MessagePort, matching: PeerIntent, closing: Promise<void>): PromiseLike<unknown> {
	let offerPosted = false;
	let postOffer = (data: any, transfer?: Transferable[]) => new Promise<DataArray>((resolve, reject) => {
		port.onmessage = ev => {
			if (waitingForResult) {
				console.log('got result', ev.data);
				waitingForResult = false;
				resolve(arrayify(ev.data));
				port.postMessage(null);
			}
		};
		if (offerPosted) {
			return reject(new Error('https://purl.org/pio/e/OfferAlreadyPosted@$Version$'));
		}
		offerPosted = true;
		if (transfer) {
			port.postMessage(data, transfer);
		} else {
			port.postMessage(data);
		}
		let waitingForResult = true;
		closing.then(() => resolve(arrayify(undefined)));
	})
	let acceptor: PeerAcceptor = {
		match: matching,
		closing
	};
	if ('using' in matcher) {
		return matcher.using(acceptor, postOffer);
	}
	let sending = Promise.resolve(
		typeof matcher.sending === 'function' ? matcher.sending(acceptor) : matcher.sending
	);
	return sending.then(resolved => postOffer(resolved));
}

function performRecv(matcher: BasicAcceptor|PostingAcceptor<unknown>, port: MessagePort, matching: PeerIntent, closing: Promise<void>) : Promise<unknown> {
	return new Promise<unknown>((resolve, reject) => {
		let waitingForOffer = true;
		let waitingForCallback = false;
		let waitingForAck = true;
		let resolveValue: any = arrayify(undefined);
		let ports: (readonly MessagePort[]) | undefined;
		let waitingForResult = true;
		let resolvePostResult: (confirmed: boolean) => void;
		let postResultPromise = new Promise<boolean>(resolve => resolvePostResult = resolve);

		port.onmessage = ev => {
			try {
				if (waitingForOffer) {
					waitingForOffer = false;

					let postResult = (data: any, transfer?: Transferable[]) => {
						if (!waitingForResult) {
							return Promise.reject(new Error('https://purl.org/pio/e/ResultAlreadyPosted@$Version$'));
						}
						waitingForResult = false;
						if (transfer) {
							port.postMessage(data, transfer);
						} else {
							port.postMessage(data);
						}
						return postResultPromise;
					};

					let offer: PeerOffer = {
						data: arrayify(ev.data),
						ports: (ports = ev.ports),
						match: matching,
						closing
					};
					waitingForCallback = true;
					let callbackPromise: PromiseLike<unknown>;
					if (typeof matcher.using === 'function') {
						callbackPromise = matcher.using(offer, postResult);
					} else {
						callbackPromise = Promise.resolve('replying' in matcher ? typeof matcher.replying === 'function' ? matcher.replying(offer) : matcher.replying : undefined).then(value => {
							postResult(value);
							return offer.data;
						});
					}
					callbackPromise.then(
						value => {
							waitingForCallback = false;
							resolveValue = value;
							if (waitingForResult) {
								postResult(null);
							} else if (!waitingForAck) {
								resolve(resolveValue);
							}
						},
						reason => {
							waitingForCallback = false;
							reject(reason);
						}
					);
				} else if (waitingForAck) {
					resolvePostResult(true);
					waitingForAck = false;
					port.postMessage(null);
					if (!waitingForCallback) {
						resolve(resolveValue);
					}
				}
			} catch (e) {
				console.error(e);
				reject(e);
			}
		};
		closing.then(() => {
			resolvePostResult(false);
			waitingForAck = false;
			if (!waitingForCallback) {
				resolve(resolveValue);
			}
			if (ports) {
				for (let port of ports) {
					port.close();
				}
			}
		});
	});
}

export interface Cat<T> {
	side: 'accepting' | 'offering';
	form: string;
	having: object;
	connect(port: MessagePort, matched: PeerIntent, closing: Promise<void>): PromiseLike<T>;
}

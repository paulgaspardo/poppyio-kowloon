/**
 * Types and functions common to client and server side
 */

/**
 * Information about the peer on the other side of a Poppy I/O exchange
 */
export interface PeerIntent {
	/** Web origin of the peer (e.g. https://example.com) */
	origin: string;
	/** The side of the exchange assumed by the peer */
	side: 'offering' | 'accepting';
	/** The form by which the peer is expecting to exchange the data, the shape of message(s) exchanged */
	form: string;
	/** Additional form-specific metadata */
	having: object;
}

/**
 * Arrayified offer/result data
 * 
 * When data is sent as an offer or result message, it's turned into an array
 * of zero elements if the data is null or empty, a single element if the data
 * sent is not an array, or the same elements if the data is already an array (but
 * note that in that case it's not the original array, it's a new array with the
 * same elements).
 * 
 * DataArray extends any[] by adding a "raw" property to get the original, pre-
 * arrayified value (including the original array if the data is array).
 */
export interface DataArray extends Array<any> {
	raw: any;
}

/**
 * poppyio package version
 */
export const version = '$Version$';

/**
 * Result of an exchange operation returned from ModalRequest.open()
 */
export type MatchResult<T> = NotMatched | Matched<T>;

/**
 * Indicates no match was made
 */
export type NotMatched = {
	matched: null
}

/**
 * Indicates a match was made
 */
export type Matched<T> = {
	/**
	 * Information about peer the exchange was performed with 
	 */
	matched: PeerIntent,
	/**
	 * Exchange result. Specific result depends on the matcher.
	 */
	value: T
};

/**
 * A matcher can be either a simple object matcher, or a dynamic matcher
 */
export type Intent = MatchingIntent | HandlingIntent<any>;

/**
 * A dynamic matcher can be a callback matcher or a connecting matcher
 */
export type HandlingIntent<T> = ConnectingIntent<T> | CallbackIntent<T>;

/**
 * A simple object matcher can be used to send or receive a single object.
 */
export type MatchingIntent = MatchingAcceptor | MatchingOffer;

/**
 * An acceptor used to receive a single object
 * 
 * The result of an exchange will be the arrayified offer data.
 * 
 *  * If the offer data is an array, the result will be that array.
 *  * If the offer data is null or undefined, the result is an empty array
 *  * Otherwise, the result will be a single-element array containing the offer data
 */
export interface MatchingAcceptor {
	/** The form or forms of the object we wish to accept */
	accepting: string|string[];

	/** Additional form-specific metadata */
	having?: object|undefined;

	offering?: never;
	connecting?: never;
	using?: never;
}

export interface PeerOffer {
	match: PeerIntent;
	data: DataArray;
	ports: readonly MessagePort[];
	closing: Promise<void>;

	postResult(data: any, transfer?: Transferable[]): Promise<boolean>;
}

/**
 * A callback matcher allows sending or receiving a single object as in
 */
export type CallbackIntent<R> = CallbackAcceptor<R> | CallbackOffer<R>;

export interface CallbackAcceptor<R> {
	/** The form or forms of the object we wish to accept */
	accepting: string|string[];

	/** Additional form-specific metadata */
	having?: object|undefined;

	using(offer: PeerOffer): PromiseLike<R>;

	offering?: never;
	connecting?: never;
}

export interface PeerAcceptor {
	match: PeerIntent;
	postOffer(data: any, transfer?: Transferable[]): Promise<DataArray>;
	closing: Promise<void>;
}

export interface CallbackOffer<R> {
	offering: string | string[];
	having?: object | undefined;
	using(acceptor: PeerAcceptor): PromiseLike<R>;

	accepting?: never;
	connecting?: never;
	sending?: never;
}

/**
 * On offer for a single object
 * 
 * The result of an exchange will be arrayified response from the acceptor
 * 
 *  * If the response data is an array, the result will be that array.
 *  * If the response data is null or undefined, the result is an empty array
 *  * Otherwise, the result will be a single-element array containing the response data
 */
export interface MatchingOffer {
	/** The form or forms of the object we can send */
	offering: string|string[];
	/** Additional form-specific metadata */
	having?: object|undefined;

	/**
	 * The data are sending, or a function returning the data to send.
	 * 
	 * If a function, the first parameter is the peer's Match information and
	 * the second parameter is a promise that resolves when the exchange is closing
	 * (in case the modal is closed before the exchange can complete).
	 * 
	 * The data may be a promise that resolves to the data to send asynchronously. 
	 */
	sending: any | Promise<any> | ((matched: PeerIntent, closing: Promise<void>) => object) | ((matched: PeerIntent, closing: Promise<void>) => PromiseLike<object>);

	accepting?: never;
	connecting?: never;
}

/**
 * A connecting matcher which performs the object exchange directly through
 * a given MessagePort
 */
export type ConnectingIntent<T> = ConnectingAcceptor<T>|ConnectingOffer<T>;

/**
 * Performs an accept operation directly using a MessagePort 
 */
export interface ConnectingAcceptor<T> {

	/** The form or forms of exchange that can be accepted */
	accepting: string|string[];

	/** Form-specific metadata */
	having?: object|undefined;

	/**
	 * Perform a accept operation over the given MessagePort.
	 * 
	 * @param port MessagePort to perform the exchange over.
	 * @param matching Peer Match information
	 * @param closing Promise that resolves when the exchange is closed, in case the
	 *                other end hangs up before the exchange is complete.
	 * 
	 * @return Promise that resolves to the exchange result. When it resolves
	 *         the exchange will be ended.
	 */
	connecting(port: MessagePort, matching: PeerIntent, closing: Promise<void>): PromiseLike<T>;

	offering?: never;
}

/**
 * Performs an offer operation directly over a MessagePort
 */
export interface ConnectingOffer<T> {

	/** The form or forms of the exchange that are offered */
	offering: string|string[];

	/** Form-specific metadata */
	having?: object|undefined;

	/**
	 * Perform a accept operation over the given MessagePort.
	 * 
	 * @param port MessagePort to perform the exchange over.
	 * @param matching Peer Match information
	 * @param closing Promise that resolves when the exchange is closed, in case the
	 *                other end hangs up before the exchange is complete.
	 * 
	 * @return Promise that resolves to the exchange result. When it resolves
	 *         the exchange will be ended.
	 */
	connecting(port: MessagePort, matching: PeerIntent, closing: Promise<void>): PromiseLike<T>;

	accepting?: never;
	sending?: never;
}

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
 * An Intent object can be either a basic intent, which specifies the data to send
 * or reply with directly, or a PostingIntent which posts the data as a separate
 * operation
 */
export type Intent = BasicIntent | PostingIntent<any>;

/**
 * A simple object matcher can be used to send or receive a single object.
 */
export type BasicIntent = BasicAcceptor | BasicOffer;

/**
 * An acceptor used to receive a single object
 * 
 * The result of an exchange will be the arrayified offer data.
 * 
 *  * If the offer data is an array, the result will be that array.
 *  * If the offer data is null or undefined, the result is an empty array
 *  * Otherwise, the result will be a single-element array containing the offer data
 */
export interface BasicAcceptor {
	/** The form or forms of the object we wish to accept */
	accepting: string|string[];

	/** Additional form-specific metadata */
	having?: object|undefined;

	/**
	 * The data to reply with, or a function returning the reply to send.
	 * 
	 * If a function, the first parameter is the peer's Match information and
	 * the second parameter is a promise that resolves when the exchange is closing
	 * (in case the modal is closed before the exchange can complete).
	 * 
	 * The data may be a promise that resolves to the data to send asynchronously. 
	 */
	replying?: any | Promise<any> | ((matched: PeerIntent, data: DataArray, ports: readonly MessagePort[], closing: Promise<void>) => object) | ((matched: PeerIntent, ports: readonly MessagePort[], closing: Promise<void>) => PromiseLike<object>);


	offering?: never;
	connecting?: never;
	using?: never;
}

export interface PeerOffer {
	match: PeerIntent;
	data: DataArray;
	ports: readonly MessagePort[];
	closing: Promise<void>;
}

/**
 * A posting intent produces the offer or response data with a callback,
 * but instead of returning the data from the callback sends it to a separate
 * posting function. This allows sending transferable objects to the peer
 * (including MessagePorts) and controlling the MatchResult value
 */
export type PostingIntent<R> = PostingAcceptor<R> | PostingOffer<R>;

/**
 * Acceptor with a callback function that separately posts the result to
 * the offering peer
 */
export interface PostingAcceptor<R> {
	/** The form or forms of the object we wish to accept */
	accepting: string|string[];

	/** Additional form-specific metadata */
	having?: object|undefined;

	using(offer: PeerOffer, postResult: (data: any, transfer?: Transferable[]) => Promise<boolean>): PromiseLike<R>;

	offering?: never;
	connecting?: never;
}

export interface PeerAcceptor {
	match: PeerIntent;
	closing: Promise<void>;
}

/**
 * Offer with a callback the separately posts the offer data to the accepting
 * peer
 */
export interface PostingOffer<R> {
	offering: string | string[];
	having?: object | undefined;
	using(acceptor: PeerAcceptor, postOffer: (data: any, transfer?: Transferable[]) => Promise<DataArray>): PromiseLike<R>;

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
export interface BasicOffer {
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
	sending: any | Promise<any> | ((acceptor: PeerAcceptor) => object) | ((acceptor: PeerAcceptor) => PromiseLike<object>);

	accepting?: never;
	connecting?: never;
}

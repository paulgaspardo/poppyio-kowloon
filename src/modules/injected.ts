import { version } from './common.js';
import { dispatch, parseOrigin } from './common-impl.js';
import { HTML } from './injected-launcher-html.js';
import ModalRequest from './modal-request.js';

export { Injected, Injected as default }

/**
 * JavaScript-injected user interface elements for Poppy I/O clients.
 * 
 * Using this is optional - you can supply your own user interface code, but for
 * convenience this provides a basic implementation of a Launcher and Modal
 * Overlay as a JavaScript module.
 * 
 * To use it you need to install localized user-facing strings using one of
 * the "inject-*" modules, for instance:
 * 
 *   import "poppyio/inject-en";
 * 
 * The "inject-*" modules only have side effects and don't export any members.
 * Installation occurs by passing an object with the strings to the add()
 * method.
 */
class Injected {

	/**
	 * Available translations
	 */
	static translations: {[key:string]:string}[] | undefined;

	/**
	 * Create a launcher function using the localized strings of the given tag.
	 * If no translation exists for the given tag, used the first one available.
	 * If none exist, presents an error message in the launcher.
	 * 
	 * @param tag Language tag of localized strings.
	 * @returns Launch function that can be assigned to ModalRequest.laucher
	 */
	static launcher(tag: string): ((popup: Window, request: ModalRequest) => void) {
		let translations = Injected.translations || [];
		if (translations.length > 0) {
			for (let translation of translations) {
				if (translation.tag === tag) {
					return (popup, request) => injectLauncher(popup, translation, request);
				}
			}
			return (popup, request) => injectLauncher(popup, translations[0], request);
		}
		return popup => popup.document.body.innerHTML = `<a href="https://js.poppy.io/a/NothingToLaunch?tag=${encodeURIComponent(tag)}">NoTranslations - ${encodeURIComponent(tag)}</a>`;
	}

	/**
	 * Create a modal overlay using the localized strings of the given tag.
	 * If no translation exists for the given tag, used the first one available.
	 * If none exist, returns nothing (undefined).
	 * 
	 * @param tag Language tag of localized strings.
	 * @returns Overlay function that can be assigned to ModalRequest.overlay
	 */
	static overlay(tag: string): ((request: ModalRequest) => () => void) | undefined {
		let translations = Injected.translations || [];
		if (translations.length > 0) {
			for (let translation of translations) {
				if (translation.tag === tag) {
					return request => injectOverlay(request, translation);
				}
			}
			return request => injectOverlay(request, translations[0]);
		}
		return undefined;
	}

	/**
	 * Install both a launcher and overlay for the given language into the
	 * specific request
	 * 
	 * @param tag Language tag to create a UI for
	 * @param request ModalRequest to configure UI for
	 * @returns The request object given
	 */
	static apply<R extends ModalRequest>(tag: string, request: R): R {
		request.launcher = Injected.launcher(tag);
		request.overlay = Injected.overlay(tag);
		return request;
	}

	/**
	 * Add localized strings to the UI, and if not yet configured set a default
	 * launcher and/or overlay in ModalRequest using those strings.
	 * 
	 * @param translation localized strings to present in the UI
	 */
	static add(translation: {[key:string]:string}) {
		(Injected.translations = Injected.translations || []).push(translation);
		if (!ModalRequest.prototype.launcher) {
			ModalRequest.prototype.launcher = Injected.launcher(translation.tag);
		}
		if (!ModalRequest.prototype.overlay) {
			ModalRequest.prototype.overlay = Injected.overlay(translation.tag);
		}
	}
}

function style<T extends Element|Element[]|null|undefined>(nodeOrNodes: T, values: Partial<CSSStyleDeclaration>): T {
	if (nodeOrNodes) {
		for (let element of Array.isArray(nodeOrNodes) ? nodeOrNodes : [nodeOrNodes]) {
			for (let key of Object.keys(values)) {
				(element as any).style[key] = (values as any)[key];
			}
		}
	}
	return nodeOrNodes;
}

function injectLauncher(popup: Window, translation: {[key:string]:string}, request: ModalRequest): void {
	popup.document.write(HTML);
	popup.document.documentElement.lang = translation['tag'];
	let bindings: {[key:string]:any} = { };

	let $ = (sel: string) => popup.document.querySelector(sel);
	let $$ = (sel: string) => Array.prototype.slice.call(popup.document.querySelectorAll(sel));
	let translated = (t: string) => (translation[t] || (t + '???')).replace(/\{(\w+)\}/g, (_: any, s: string) => bindings[s]);

	let leaving = false;
	popup.addEventListener('onpagehide' in popup ? 'pagehide' : 'unload', () => {
		if (!leaving) {
			popup.close();
		}
	});

	popup.document.title = translated('title');
	for (let t of ($$('[data-t]') as HTMLElement[])) {
		t.textContent = translated(t.dataset.t!);
	}

	($('#cancelButton')! as HTMLButtonElement).onclick = () => {
		request.cancel();
		popup.close();
	}
	let onKeyDown = (ev: KeyboardEvent) => {
		if (ev.key === 'Escape' || ev.key === 'Esc') {
			request.cancel();
		}
	};
	popup.document.addEventListener('keydown', onKeyDown);

	let theForm = $('#theForm')! as HTMLFormElement;
	let domainInput = $('#domainInput')! as HTMLInputElement;
	let goButton = $('#goButton')! as HTMLButtonElement;
	let status = $('#status')! as HTMLSpanElement;
	let stop = $('#stop')! as HTMLAnchorElement;

	style($('body'), {
		fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
		textAlign: 'center'
	})
	style(domainInput, {
		width: '80%'
	});
	style($('#buttons'), {
		marginTop: '0.5em'
	});
	style($$('#buttons button'), {
		width: '10em',
		margin: '0.5em'
	});
	
	stop.style.display = 'none';

	status.textContent = 'poppyio.js ' + version;

	theForm.onsubmit = e => {
		e.preventDefault();
		let domain = bindings.domain = domainInput.value.trim();
		if (!domain) {
			return;
		}
		domainInput.disabled = goButton.disabled = true;
		status.textContent = translated('lookingUp');
		let findServiceUrl = (responseText: string) => {
			let response: any;
			try {
				response = JSON.parse(responseText);
			} catch (e) {
				return null;
			}
			if (!Array.isArray(response.links)) {
				return null;
			}
			for (let link of response.links) {
				if (!link) continue;
				if (link.rel !== 'https://js.poppy.io/a/Service-1') continue;
				if (typeof link.href !== 'string') continue;
				return link.href as string;
			}
			return null;
		};
		let xhr = new XMLHttpRequest;
		xhr.open('GET', 'https://' + domain + '/.well-known/host-meta.json');
		xhr.onerror = () => {
			stop.style.display = 'none';
			domainInput.disabled = goButton.disabled = false;
			status.textContent = translated('serviceNotFound');
		};
		xhr.onload = () => {
			stop.style.display = 'none';
			let serviceUrl = findServiceUrl(xhr.responseText);
			if (typeof serviceUrl !== 'string') {
				status.textContent = translated('serviceNotFound');
				return;
			}
			status.textContent = `Poppy.io service found for ${domain}, taking you there...`;
			let serviceUrlOrigin = parseOrigin(serviceUrl);
			if (serviceUrlOrigin) {
				leaving = true;
				dispatch(popup.opener, 'ChangeLocation', serviceUrl);
			} else if (serviceUrl.indexOf('/') === 0) {
				leaving = true;
				dispatch(popup.opener, 'ChangeLocation', 'https://' + domain + serviceUrl);
			} else {
				status.textContent = translated('serviceNotValid');
				domainInput.disabled = goButton.disabled = false;
			}
		};
		xhr.onabort = () => {
			stop.style.display = 'none';
			domainInput.disabled = goButton.disabled = false;
			status.textContent = translated('aborted');
		}
		xhr.send();
		stop.style.display = 'inline';
		stop.onclick = e => {
			e.preventDefault();
			xhr.abort();
		}
	};

	let pollParentGoneInterval = popup.setInterval(() => {
		if (!popup.opener) {
			status.textContent = translated('gone');
			domainInput.disabled = goButton.disabled = true;
			popup.clearInterval(pollParentGoneInterval);
			request.cancel();
			popup.close();
		}
	}, 150);

	domainInput.focus();
}

function injectOverlay(request: ModalRequest, translation: {[key:string]:string}): () => void {
	const container = ModalRequest.container || document.body;
	let bindings: {[key:string]:string} = {};
	let translated = (t: string) => (translation[t] || (t + '???')).replace(/\{(\w+)\}/g, (_: any, s: string) => bindings[s]);

	let bgDiv = style(document.createElement('div'), {
		backgroundColor: 'black',
		opacity: '0.5',
		position: 'fixed',
		top: '0',
		left: '0',
		width: '100%',
		height: '100%'
	});
	container.appendChild(bgDiv);

	let rootDiv = style(document.createElement('div'), {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '100%',
		height: '100%',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center'
	});
	container.appendChild(rootDiv);

	let msgOuterDiv = document.createElement('div');
	rootDiv.appendChild(msgOuterDiv);
	let msgDiv = style(document.createElement('div'), {
		margin: 'auto',
		padding: '2em',
		color: 'black',
		border: '1px solid black',
		background: 'white',
		textAlign: 'center',
		maxWidth: '20em'
	});
	msgOuterDiv.appendChild(msgDiv);
	
	let msgText = style(document.createElement('div'), {
		paddingBottom: '1em'
	});
	msgText.textContent = translated('poppyOpen');
	msgDiv.appendChild(msgText);

	let cancelButton = document.createElement('button');
	cancelButton.textContent = translated('cancelAndClose');
	msgDiv.appendChild(cancelButton);
	cancelButton.addEventListener('click', () => request.cancel());

	let onKeyDown = (ev: KeyboardEvent) => {
		if (ev.key === 'Escape' || ev.key === 'Esc') {
			request.cancel();
		}
	};
	document.addEventListener('keydown', onKeyDown);
	return () => {
		bgDiv.parentNode?.removeChild(bgDiv);
		rootDiv.parentNode?.removeChild(rootDiv);
		document.removeEventListener('keydown', onKeyDown);
	}
}

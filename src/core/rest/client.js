import * as Requests from './requests';
import {getToken, getItem, setToken} from './storadge';
import {Toast} from '../../library/Toast';

let instance;

const FAILD_RESPONSE = {
	ok: false,
	error: 'Timeout wait error',
};

const isConected = true; // соединение есть или нет

/**
 * @class RequestsManager
 * @classdesc Выполняет запросы к серверу
 */
class RequestsManager {
	/**
	 * Инициализация
	 * @static
	 * @returns экземпляр этого класса
	 * @memberof RequestsManager
	 */
	static instance() {
		if (!instance) {
			instance = new RequestsManager();
			console.log('Init ManagerRequest, methods:', Requests);
		}
		return instance;
	}

	constructor() {
		this.bufferRequest = [];
		this.currentNextId = 0;
		this.isWait = false;
		this.methodList = [
			// лист методов которые не должны дублироваться
			'login',
		];
		this.methodResponse = [
			// лист методов которые должны получать ответ в любом случае
		];
		this.update();
	}

	/**
	 * Генерирует идентификатор для запроса
	 * @returns идентификатор в очереди запросов
	 * @memberof RequestsManager
	 */
	generationId() {
		this.currentNextId += 1;
		if (+this.currentNextId > 9 * 1000) this.currentNextId = 0;
		return this.currentNextId + this.bufferRequest.length;
	}

	/**
	 * Обновление очереди запросов, выполнение запросов по возможности
	 * @memberof RequestsManager
	 */
	update() {
		setInterval(() => {
			this.bufferRequest.forEach(item => {
				if (!item.isWorkRequest && isConected && !this.isWait) {
					item.method();
					item.isWorkRequest = true;
				}
				if (item.timeWait <= item.timeWork || item.timeWait <= item.timeWaitWork) {
					this.stopRequest(item.id);
					item.callback(FAILD_RESPONSE);
				}
				if (item.isWorkRequest) item.timeWork += 1;
				if (!item.isWorkRequest) item.timeWaitWork += 1;
			});
		}, 1000);
	}

	/**
	 * Фильтрует поступающие запросы по настройками (повторение)
	 * @param {String} nameMethod  имя запроса
	 * @returns разрешен ли запрос или нет
	 * @memberof RequestsManager
	 */
	filterRequest(nameMethod) {
		if (this.methodList.includes(nameMethod)) {
			return !this.bufferRequest.some(item => item.name === nameMethod);
		}
		return true;
	}

	/**
	 * Фильтрует ответы
	 * @param {String} nameMethod имя запроса
	 * @returns  получить ли ответ в любом случае
	 * @memberof RequestsManager
	 */
	filterResponse(nameMethod) {
		return this.methodResponse.includes(nameMethod);
	}

	/**
	 * Регистрирует запрос
	 *
	 * @param {Number} timeWait время ожидания ответа от сервера
	 * @param {Function} method инкапсулированный запрос
	 * @param {String} name имя запроса
	 * @param {Object} [params={}] данные в запрос
	 * @param {Function} callBack функция обратного вызова для выполнения логики над результатом запроса
	 * @memberof RequestsManager
	 */
	addRequest(timeWait, method, name, params, callback) {
		if (this.filterRequest(name)) {
			const request = {
				id: this.generationId(),
			};

			this.bufferRequest.push({
				id: request.id,
				name, // Имя запроcа
				isWorkRequest: false,
				timeWaitWork: 0, // время ожидания в очереди
				timeWork: 0, // текущее время ожидания ответа
				timeWait, // заданное время ожидания ответа, после которого запрос больше не ожидается и возвращается стандартный ответ
				method: async () => {
					try {
						method({...params, token: await getToken()}, res => {
							this.stopRequest(request.id);
							callback(res);
						});
					} catch (e) {
						console.log('error: ', e);
					}
				}, // Запрос
				callback,
			});
		}
	}

	/**
	 * Выгружает запрос из очереди ожидания.
	 *
	 * @param {Number} id идентификатор запроса
	 * @memberof RequestsManager
	 */
	stopRequest(id) {
		this.bufferRequest = this.bufferRequest.filter(element => element.id !== id);
	}

	/**
	 * Обновляет токен сессии
	 */
	async refreshToken(success, error) {
		const time = await getItem('timeRefresh');
		console.log(time, Date.now());
		if (time !== '' && +time < Date.now()) {
			this.isWait = true;
			const refreshToken = await getItem('refreshToken');
			console.log('Refresh');
			Requests.refreshToken({token: refreshToken}, (t, r, tim) => {
				if (tim === '') {
					error && error();
				} else {
					setToken(t, r, tim);
					success && success();
				}
				this.isWait = false;
			});
		} else {
			success && success();
		}
	}
}

const manager = RequestsManager.instance();

export {manager};
export default async (method, params, success, error) => {
	if (Requests[method]) {
		await manager.refreshToken(null, error);

		console.log(`request.${method}.params: `, params);

		manager.addRequest(35, Requests[method], method, params, async res => {
			// Настраивается в зависимости от клиента и типа сообщений
			console.log(`response.${method}: `, res);
			if (res.ok) {
				success(res.result);
			} else {
				error(res.result);
				Toast.requestError(res.result);
			}
		});
	} else {
		console.log(`ERROR: REQUEST ${method} NOT FOUND !!!`);
	}
};
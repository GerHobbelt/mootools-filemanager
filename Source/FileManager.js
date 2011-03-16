/*
 * ---
 *
 * description: FileManager
 *
 * authors: Christoph Pojer (@cpojer), Fabian Vogelsteller (@frozeman)
 *
 * license: MIT-style license
 *
 * requires:
 *  core/1.3.1: '*'
 *  more/1.3.1.1: [Array.Extras, String.QueryString, Hash, Element.Delegation, Element.Measure, Fx.Scroll, Fx.SmoothScroll, Drag, Drag.Move, Assets, Tips ]
 *
 * provides: Filemanager
 *
 * ...
 */

var MooFileManagerUniqueID = 1;
var FileManager = new Class({

	Implements: [Options, Events],

	Request: null,
	Directory: null,
	Current: null,
	ID: null,

	options: {
		/*onComplete: function(){},
		onModify: function(){},
		onShow: function(){},
		onHide: function(){},
		onPreview: function(){}*/
		directory: '',
		url: null,
		assetBasePath: null,
		language: 'en',
		selectable: false,
		destroy: false,
		rename: false,
		download: false,
		createFolders: false,
		filter: '',
		hideOnClick: false,
		hideClose: false,
		hideOverlay: false,
		hideQonDelete: false,
		propagateData: {}       // extra query parameters sent with every request to the backend
	},

	hooks: {
		show: {},
		cleanup: {}
	},

	initialize: function(options) {
		this.setOptions(options);
		this.ID = MooFileManagerUniqueID++;
		this.dragZIndex = 1300;
		this.droppables = [];
		this.assetBasePath = this.options.assetBasePath.replace(/(\/|\\)*$/, '/');
		this.Directory = this.options.directory;
		this.listType = 'list';
		this.dialogOpen = false;
		this.usingHistory = false;
		this.fmShown = false;
		this.drop_pending = 0;   // state: 0: no drop pending, 1: copy pending, 2: move pending
		this.view_fill_timer = null;   // timer reference when fill() is working chunk-by-chunk.

		this.language = Object.clone(FileManager.Language.en);
		if(this.options.language != 'en') this.language = Object.merge(this.language, FileManager.Language[this.options.language]);

		this.container = new Element('div', {'class': 'filemanager-container' + (Browser.opera ? ' filemanager-engine-presto' : '') + (Browser.ie ? ' filemanager-engine-trident' : '') + (Browser.ie8 ? '4' : '') + (Browser.ie9 ? '5' : '')});
		this.filemanager = new Element('div', {'class': 'filemanager'}).inject(this.container);
		this.header = new Element('div', {'class': 'filemanager-header'}).inject(this.filemanager);
		this.menu = new Element('div', {'class': 'filemanager-menu'}).inject(this.filemanager);
		this.loader = new Element('div', {'class': 'loader', opacity: 0, tween: {duration: 300}}).inject(this.header);
		this.previewLoader = new Element('div', {'class': 'loader', opacity: 0, tween: {duration: 300}});
		this.browserLoader = new Element('div', {'class': 'loader', opacity: 0, tween: {duration: 300}});
		// switch the path, from clickable to input text
		this.clickablePath = new Element('span', {'class': 'filemanager-dir'});
		this.selectablePath = new Element('input',{'type':'text','class': 'filemanager-dir','readonly':'readonly'});
		this.pathTitle = new Element('a', {href:'#','class': 'filemanager-dir-title',text: this.language.dir}).addEvent('click',(function(e){
			e.stop();
			if(this.header.getElement('span.filemanager-dir')!= null) {
				this.selectablePath.setStyle('width',(this.header.getSize().x - this.pathTitle.getSize().x - 55));
				this.selectablePath.replaces(this.clickablePath);
			} else
				this.clickablePath.replaces(this.selectablePath);
		}).bind(this));
		this.header.adopt(this.pathTitle,this.clickablePath);

		var self = this;
		// -> catch a click on an element in the file/folder browser
		this.relayClick = function(e) {
			if(e) e.stop();
			self.storeHistory = true;

			var file = this.retrieve('file');
			//if (typeof console !== 'undefined' && console.log) console.log('on relayClick file = ' + file.mime + ': ' + file.path + ' : ' + file.name + ' : ' + self.Directory + ', source = ' + 'retrieve');
			if (this.retrieve('edit')) {
				this.eliminate('edit');
				return;
			}
			if (file.mime == 'text/directory'){
				this.addClass('selected');
				self.load(self.Directory + file.name);
				return;
			}

			// when we're right smack in the middle of a drag&drop, which may end up as a MOVE, do NOT send a 'detail' request
			// alongside (through fillInfo) as that may lock the file being moved, server-side.
			// It's good enough to disable the detail view, if we want/need to.
			//
			// Note that this info is stored in the instance variable: this.drop_pending -- more functions may check this one!
			this.fillInfo(file);
			if (self.Current) self.Current.removeClass('selected');
			// ONLY do this when we're doing a COPY or on a failed attempt...
			// CORRECTION: as even a failed 'drop' action will have moved the cursor, we can't keep this one selected right now:
			if (0 && self.drop_pending != 2) {
				self.Current = this.addClass('selected');
			}

			self.switchButton();
		};

		this.toggleList = function(e) {
			//if (typeof console !== 'undefined' && console.log) console.log('togglelist: key press: ' + (e ? e.key : '---'));
			if(e) e.stop();
			$$('.filemanager-browserheader a').set('opacity',0.5);
			if(!this.browserMenu_thumb.retrieve('set',false)) {
				this.browserMenu_list.store('set',false);
				this.browserMenu_thumb.store('set',true).set('opacity',1);
				this.listType = 'thumb';
				if(typeof jsGET != 'undefined') jsGET.set('fmListType=thumb');
			} else {
				this.browserMenu_thumb.store('set',false);
				this.browserMenu_list.store('set',true).set('opacity',1);
				this.listType = 'list';
				if(typeof jsGET != 'undefined') jsGET.set('fmListType=list');
			}
			//if (typeof console !== 'undefined' && console.log) console.log('on toggleList dir = ' + this.Directory + ', source = ' + '---');
			this.load(this.Directory);
		};

		this.browsercontainer = new Element('div',{'class': 'filemanager-browsercontainer'}).inject(this.filemanager);
		this.browserheader = new Element('div',{'class': 'filemanager-browserheader'}).inject(this.browsercontainer);
		this.browserheader.adopt(this.browserLoader);
		this.browserScroll = new Element('div', {'class': 'filemanager-browserscroll'}).inject(this.browsercontainer).addEvent('mouseover',(function(){
			this.browser.getElements('span.fi.hover').each(function(span){ span.removeClass('hover'); });
		}).bind(this));
		this.browserMenu_thumb = new Element('a',{
				'id':'toggle_side_boxes',
				'class':'listType',
				'style' : 'margin-right: 10px;',
				'title': this.language.toggle_side_boxes
			}).set('opacity',0.5).addEvents({
				click: this.toggleList.bind(this)
			});
		this.browserMenu_list = new Element('a',{
				'id':'toggle_side_list',
				'class':'listType',
				'title': this.language.toggle_side_list
			}).set('opacity',1).addEvents({
				click: this.toggleList.bind(this)
			});
		this.browser_dragndrop_info = new Element('a',{
				'id':'drag_n_drop',
				//'class':'listType',
				'style' : 'margin-right: 10px;',
				'title': this.language.drag_n_drop_disabled
			}); // .setStyle('visibility', 'hidden');
		this.browserheader.adopt([this.browserMenu_thumb, this.browserMenu_list, this.browser_dragndrop_info]);

		this.browser = new Element('ul', {'class': 'filemanager-browser'}).inject(this.browserScroll);

		if(this.options.createFolders) this.addMenuButton('create');
		if(this.options.download) this.addMenuButton('download');
		if(this.options.selectable) this.addMenuButton('open');

		this.info = new Element('div', {'class': 'filemanager-infos', opacity: 0}).inject(this.filemanager);

		var head = new Element('div', {'class': 'filemanager-head'}).adopt([
			new Element('img', {'class': 'filemanager-icon'}),
			new Element('h1')
		]);

		this.info.adopt([head, new Element('h2', {text: this.language.information})]);

		new Element('dl').adopt([
			new Element('dt', {text: this.language.modified}),
			new Element('dd', {'class': 'filemanager-modified'}),
			new Element('dt', {text: this.language.type}),
			new Element('dd', {'class': 'filemanager-type'}),
			new Element('dt', {text: this.language.size}),
			new Element('dd', {'class': 'filemanager-size'})
		]).inject(this.info);

		this.preview = new Element('div', {'class': 'filemanager-preview'}).addEvent('click:relay(img.preview)', function(){
			self.fireEvent('preview', [this.get('src')]);
		});
		this.info.adopt([
			new Element('h2', {'class': 'filemanager-headline', text: this.language.more}),
			this.preview
		]);

		if(!this.options.hideClose) {
			this.closeIcon = new Element('a', {
				'class': 'filemanager-close',
				opacity: 0.5,
				title: this.language.close,
				events: {click: this.hide.bind(this)}
			}).inject(this.filemanager).addEvent('mouseover',function(){this.fade(1);}).addEvent('mouseout',function(){this.fade(0.5);});
		}

		this.tips = new Tips({
			className: 'tip-filebrowser',
			offsets: {x: 15, y: 0},
			text: null,
			showDelay: 50,
			hideDelay: 50,
			onShow: function(){
				this.tip.set('tween', {duration: 250}).setStyle('display', 'block').fade(1);
			},
			onHide: function(){
				this.tip.fade(0).get('tween').chain(function(){
					this.element.setStyle('display', 'none');
				});
			}
		});
		if(!this.options.hideClose)
			this.tips.attach(this.closeIcon);

		this.imageadd = new Asset.image(this.assetBasePath + 'Images/add.png', {
			'class': 'browser-add'
		}).set('opacity', 0).set('tween',{duration:300}).inject(this.container);

		this.container.inject(document.body);
		if(!this.options.hideOverlay) {
			this.overlay = new Overlay(this.options.hideOnClick ? {
				events: {click: this.hide.bind(this)}
			} : null);
		}

		this.bound = {
			keydown: (function(e){
				//if (typeof console !== 'undefined' && console.log) console.log('keydown: key press: ' + e.key);
				if (e.control || e.meta) this.imageadd.fade(1);
			}).bind(this),
			keyup: (function(){
				this.imageadd.fade(0);
			}).bind(this),
			toggleList: (function(e){
				//if (typeof console !== 'undefined' && console.log) console.log('toggleList 2 key press: ' + e.key);
				if(this.dialogOpen) return;
				if(e.key=='tab') {
					e.preventDefault();
					this.toggleList();
				}
			}).bind(this),
			keyesc:( function(e) {
				//if (typeof console !== 'undefined' && console.log) console.log('keyEsc 2 key press: ' + e.key);
				if(this.dialogOpen) return;

				if (e.key=='esc') this.hide();
			}).bind(this),
			keyboardInput: (function(e) {
				if (typeof console !== 'undefined' && console.log) console.log('key press: ' + e.key);
				if(this.dialogOpen) return;
				switch (e.key) {
				case 'up':
				case 'down':
				case 'pageup':
				case 'pagedown':
				case 'home':
				case 'end':
				case 'enter':
				case 'delete':
					e.preventDefault();
					this.browserSelection(e.key);
					break;
				}
			}).bind(this),
			scroll: (function(){
				this.fireEvent('scroll');
				this.fitSizes();
			}).bind(this)
		};

		this.fitSizes = function() {
			this.filemanager.center(this.offsets);
			containerSize = this.filemanager.getSize();
			headerSize = this.browserheader.getSize();
			menuSize = this.menu.getSize();
			this.browserScroll.setStyle('height',containerSize.y - headerSize.y);
			this.info.setStyle('height',containerSize.y - menuSize.y);
		};

		// ->> autostart filemanager when set
		if(!this.galleryPlugin) {
			if(typeof jsGET != 'undefined' && jsGET.get('fmID') == this.ID)
					this.show();
			else {
				window.addEvent('jsGETloaded',(function(){
					if(typeof jsGET != 'undefined' && jsGET.get('fmID') == this.ID)
						this.show();
				}).bind(this));
			}
		}
	},

	hashHistory: function(vars) { // get called from the jsGET listener
		this.storeHistory = false;
		//if (typeof console !== 'undefined' && console.log) console.log(vars);
		if(vars.changed['fmPath'] == '')
			vars.changed['fmPath'] = '/';

		Object.each(vars.changed,function(value,key) {
			//if (typeof console !== 'undefined' && console.log) console.log('on hashHistory key = ' + key + ', value = ' + value + ', source = ' + '---');
			if(key == 'fmPath') {
				this.load(value);
			}

			if(key == 'fmFile') {
				this.browser.getElements('span.fi span').each((function(current) {
					current.getParent('span.fi').removeClass('hover');
					if(current.get('title') == value) {
						this.deselect();
						this.Current = current.getParent('span.fi');
						new Fx.Scroll(this.browserScroll,{duration: 250,offset:{x:0,y:-(this.browserScroll.getSize().y/4)}}).toElement(current.getParent('span.fi'));
						current.getParent('span.fi').addClass('selected');
						//if (typeof console !== 'undefined' && console.log) console.log('on hashHistory @ fillInfo key = ' + key + ', value = ' + value + ', source = ' + ' - file = ' + current.getParent('span.fi').retrieve('file').name);
						this.fillInfo(current.getParent('span.fi').retrieve('file'));
					}
				}).bind(this));
			}
		},this);
	},

	show: function(e) {
		//if (typeof console !== 'undefined' && console.log) console.log('on show');
		if(e) e.stop();
		if(this.fmShown) return;
		this.fmShown = true;
		this.onShow = false;
		// get and set history
		if(typeof jsGET != 'undefined') {
			if(jsGET.get('fmFile') != null) this.onShow = true;
			if(jsGET.get('fmListType') != null) {
				$$('.filemanager-browserheader a').set('opacity',0.5);
				this.listType = jsGET.get('fmListType');
				if(this.listType == 'thumb')
					this.browserMenu_thumb.store('set',true).set('opacity',1);
				else
					this.browserMenu_list.store('set',true).set('opacity',1);
			}
			if(jsGET.get('fmPath') != null) this.Directory = jsGET.get('fmPath');
			jsGET.set({'fmID':this.ID,'fmPath':this.Directory});
			this.hashListenerId = jsGET.addListener(this.hashHistory,false,this);
		}

		//if (typeof console !== 'undefined' && console.log) console.log('on show file = ' + this.Directory + ', source = ' + '---');
		this.load(this.Directory);
		if(!this.options.hideOverlay)
			this.overlay.show();

		this.info.set('opacity', 0);
		this.container.set('opacity', 0);

		this.container.setStyles({
				opacity: 0,
				display: 'block'
			});

		window.addEvents({
			'scroll': this.bound.scroll,
			'resize': this.bound.scroll
		});
		// add keyboard navigation
		//if (typeof console !== 'undefined' && console.log) console.log('add keyboard nav on show file = ' + this.Directory + ', source = ' + '---');
		document.addEvent('keydown', this.bound.toggleList);
		window.addEvent('keydown', this.bound.keyesc);
		if((Browser.Engine && (Browser.Engine.trident || Browser.Engine.webkit)) || (Browser.ie || Browser.chrome || Browser.safari))
		 document.addEvent('keydown', this.bound.keyboardInput);
		else
		 document.addEvent('keypress', this.bound.keyboardInput);
		this.container.tween('opacity',1);

		this.fitSizes();
		this.fireEvent('show');
		this.fireHooks('show');
	},

	hide: function(e){
		//if (typeof console !== 'undefined' && console.log) console.log('on hide');
		if (e) e.stop();
		if(!this.fmShown) return;
		this.fmShown = false;

		// stop hashListener
		if(typeof jsGET != 'undefined') {
			jsGET.removeListener(this.hashListenerId);
			jsGET.remove(['fmID','fmPath','fmFile','fmListType']);
		}

		if(!this.options.hideOverlay)
			this.overlay.hide();
		this.tips.hide();
		this.browser.empty();
		this.container.setStyle('display', 'none');

		// remove keyboard navigation
		//if (typeof console !== 'undefined' && console.log) console.log('REMOVE keyboard nav on hide');
		window.removeEvent('scroll', this.bound.scroll).removeEvent('resize', this.bound.scroll);
		document.removeEvent('keydown', this.bound.toggleList);
		window.removeEvent('keydown', this.bound.keyesc);
		if((Browser.Engine && (Browser.Engine.trident || Browser.Engine.webkit)) || (Browser.ie || Browser.chrome || Browser.safari))
			document.removeEvent('keydown', this.bound.keyboardInput);
		else
			document.removeEvent('keypress', this.bound.keyboardInput);

		this.fireHooks('cleanup');
		this.fireEvent('hide');
	},

	open: function(e){
		e.stop();
		if (!this.Current) return;
		this.fireEvent('complete', [
			this.normalize(this.Current.retrieve('file').path),
			this.Current.retrieve('file')
		]);
		this.hide();
	},

	download: function(e) {
		e.stop();
		if (!this.Current) return;
		//if (typeof console !== 'undefined' && console.log) console.log('download: ' + this.Current.retrieve('file').path + ', ' + this.normalize(this.Current.retrieve('file').path));
		var file = this.Current.retrieve('file');
		window.open(this.options.url + (this.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, this.options.propagateData, {
			event: 'download',
			file: this.normalize(file.dir + file.name),
			filter: this.options.filter
		})));
	},

	create: function(e) {
		e.stop();
		var input = new Element('input', {'class': 'createDirectory','autofocus':'autofocus'});

		var self = this;
		new Dialog(this.language.createdir, {
			language: {
				confirm: this.language.create,
				decline: this.language.cancel
			},
			content: [
				input
			],
			onOpen: this.onDialogOpen.bind(this),
			onClose: this.onDialogClose.bind(this),
			onShow: function(){
				//if (typeof console !== 'undefined' && console.log) console.log('add key up on create dialog:onshow');
				input.addEvent('keyup', function(e){
					if (e.key == 'enter') e.target.getParent('div.dialog').getElement('button.dialog-confirm').fireEvent('click');
				}).focus();
			},
			onConfirm: function() {
				new FileManager.Request({
					url: self.options.url + (self.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, self.options.propagateData, {
						event: 'create'
					})),
					data: {
						file: input.get('value'),
						directory: self.Directory,
						type: self.listType,
						filter: self.options.filter
					},
					onRequest: self.browserLoader.set('opacity', 1),
					onSuccess: (function(j) {
						if (!j || !j.status) {
							// TODO: include j.error in the message, iff j.error exists
							new Dialog(('' + j.error).substitute(self.language, /\\?\$\{([^{}]+)\}/g) , {language: {confirm: self.language.ok}, buttons: ['confirm']});
							this.browserLoader.fade(0);
							return;
						}

						self.fill.bind(self)
						this.browserLoader.fade(0);
					}).bind(self),
					onComplete: function(){},
					onError: (function(text, error) {
						this.showError(text);
						this.browserLoader.fade(0);
					}).bind(self),
					onFailure: (function(xmlHttpRequest) {
						var text = this.cvtXHRerror2msg(xmlHttpRequest);
						this.showError(text);
						this.browserLoader.fade(0);
					}).bind(self)
				}, self).send();
			}
		});
	},

	deselect: function(el) {
		if (el && this.Current != el) return;
		//if (typeof console !== 'undefined' && console.log) console.log('deselect:Current');
		if (el) this.fillInfo();
		if (this.Current) this.Current.removeClass('selected');
		this.Current = null;
		this.switchButton();
	},

	load: function(dir, nofade) {

		var self = this;

		this.deselect();
		if (!nofade) this.info.fade(0);

		if (this.Request) this.Request.cancel();

		//if (typeof console !== 'undefined' && console.log) console.log('view URI: ' + this.options.url + ', ' + (this.options.url.indexOf('?') == -1 ? '?' : '&') + ', ' + Object.toQueryString(Object.merge({}, this.options.propagateData, {    event: 'view'  })));
		this.Request = new FileManager.Request({
			url: this.options.url + (this.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, this.options.propagateData, {
				event: 'view'
			})),
			data: {
				directory: dir,
				type: this.listType,
				filter: this.options.filter
			},
			onRequest: (function(){
				//if (typeof console !== 'undefined' && console.log) console.log("### 'view' request: onRequest invoked");
				this.browserLoader.set('opacity', 1);
				// abort any still running ('antiquated') fill chunks:
				$clear(this.view_fill_timer);
			}).bind(self),
			onSuccess: (function(j) {
				//if (typeof console !== 'undefined' && console.log) console.log("### 'view' request: onSuccess invoked");
				if (!j || !j.status) {
					// TODO: include j.error in the message, iff j.error exists
					new Dialog(('' + j.error).substitute(self.language, /\\?\$\{([^{}]+)\}/g) , {language: {confirm: self.language.ok}, buttons: ['confirm']});
					this.browserLoader.fade(0);
					return;
				}

				this.fill(j, nofade);
				this.browserLoader.fade(0);
			}).bind(self),
			onComplete: (function() {
				//if (typeof console !== 'undefined' && console.log) console.log("### 'view' request: onComplete invoked");
				this.fitSizes();
				//this.browserLoader.fade(0);
			}).bind(self),
			onError: (function(text, error) {
				// a JSON error
				//if (typeof console !== 'undefined' && console.log) console.log("### 'view' request: onError invoked");
				this.showError(text);
				this.browserLoader.fade(0);
			}).bind(self),
			onFailure: (function(xmlHttpRequest) {
				// a generic (non-JSON) communication failure
				//if (typeof console !== 'undefined' && console.log) console.log("### 'view' request: onFailure invoked");
				var text = this.cvtXHRerror2msg(xmlHttpRequest);
				this.showError(text);
				this.browserLoader.fade(0);
			}).bind(self)
		}, this).send();
	},

	destroy_noQasked: function(file) {
		var self = this;
		new FileManager.Request({
			url: self.options.url + (self.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, self.options.propagateData, {
				event: 'destroy'
			})),
			data: {
				file: file.name,
				directory: self.Directory,
				filter: self.options.filter
			},
			onRequest: self.browserLoader.set('opacity', 1),
			onSuccess: (function(j) {
				if (!j || !j.status) {
					// TODO: include j.error in the message, iff j.error exists
					var emsg = ('' + j.error).substitute(self.language, /\\?\$\{([^{}]+)\}/g);
					new Dialog(self.language.nodestroy + ' (' + emsg + ')', {language: {confirm: self.language.ok}, buttons: ['confirm']});
					this.browserLoader.fade(0);
					return;
				}

				self.fireEvent('modify', [Object.clone(file)]);
				file.element.getParent().fade(0).get('tween').chain(function(){
					self.deselect(file.element);
					this.element.destroy();
				});
				this.browserLoader.fade(0);
			}).bind(self),
			onComplete: function(){},
			onError: (function(text, error) {
				this.showError(text);
				this.browserLoader.fade(0);
			}).bind(self),
			onFailure: (function(xmlHttpRequest) {
				var text = this.cvtXHRerror2msg(xmlHttpRequest);
				this.showError(text);
				this.browserLoader.fade(0);
			}).bind(self)
		}, this).send();
	},

	destroy: function(file){
		var self = this;
		if (self.options.hideQonDelete) {
			self.destroy_noQasked(file);
		}
		else {
			new Dialog(this.language.destroyfile, {
				language: {
					confirm: this.language.destroy,
					decline: this.language.cancel
				},
				onOpen: this.onDialogOpen.bind(this),
				onClose: this.onDialogClose.bind(this),
				onConfirm: function() {
					self.destroy_noQasked(file);
				}
			});
		}
	},

	rename: function(file) {
		var self = this;
		var name = file.name;
		var input = new Element('input', {'class': 'rename', value: name,'autofocus':'autofocus'});

		// if (file.mime != 'text/directory') name = name.replace(/\..*$/, '');     -- unused

		new Dialog(this.language.renamefile, {
			language: {
				confirm: this.language.rename,
				decline: this.language.cancel
			},
			content: [
				input
			],
			onOpen: this.onDialogOpen.bind(this),
			onClose: this.onDialogClose.bind(this),
			onShow: function(){
				//if (typeof console !== 'undefined' && console.log) console.log('add key up on rename dialog:onshow');
				input.addEvent('keyup', function(e){
					if (e.key=='enter') e.target.getParent('div.dialog').getElement('button.dialog-confirm').fireEvent('click');
				}).focus();
			},
			onConfirm: (function(){
				new FileManager.Request({
					url: this.options.url + (this.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, this.options.propagateData, {
						event: 'move'
					})),
					data: {
						file: file.name,
						name: input.get('value'),
						directory: self.Directory,
						filter: self.options.filter
					},
					onRequest: self.browserLoader.set('opacity', 1),
					onSuccess: (function(j) {
						if (!j || !j.status) {
							// TODO: include j.error in the message, iff j.error exists
							new Dialog(('' + j.error).substitute(self.language, /\\?\$\{([^{}]+)\}/g) , {language: {confirm: self.language.ok}, buttons: ['confirm']});
							this.browserLoader.fade(0);
							return;
						}
						self.fireEvent('modify', [Object.clone(file)]);
						file.element.getElement('span.filename').set('text', j.name).set('title', j.name);
						file.element.addClass('selected');
						file.name = j.name;
						//if (typeof console !== 'undefined' && console.log) console.log('move : onSuccess: fillInfo: file = ' + file.name);
						self.fillInfo(file);
						this.browserLoader.fade(0);
					}).bind(self),
					onComplete: function(){},
					onError: (function(text, error) {
						this.showError(text);
						this.browserLoader.fade(0);
					}).bind(self),
					onFailure: (function(xmlHttpRequest) {
						var text = this.cvtXHRerror2msg(xmlHttpRequest);
						this.showError(text);
						this.browserLoader.fade(0);
					}).bind(self)
				}, self).send();
			}).bind(this)
		});
	},

	browserSelection: function(direction) {
		if(this.browser.getElement('li') == null) return;

		// none is selected
		if(this.browser.getElement('span.fi.hover') == null && this.browser.getElement('span.fi.selected') == null)
		{
			// select first folder
			current = this.browser.getFirst('li').getElement('span.fi');
		}
		else
		{
			// select the current file/folder or the one with hover
			var current = null;
			if(this.browser.getElement('span.fi.hover') == null && this.browser.getElement('span.fi.selected') != null) {
				current = this.browser.getElement('span.fi.selected');
			}
			else if(this.browser.getElement('span.fi.hover') != null) {
				current = this.browser.getElement('span.fi.hover');
			}
		}

		var stepsize = 1;
		switch (direction) {
		// go down
		case 'end':
			stepsize = 1E5;
			/* fallthrough */
		case 'pagedown':
			if (stepsize == 1) {
				if (current.getPosition(this.browserScroll).y + current.getSize().y * 2 < this.browserScroll.getSize().y) {
					stepsize = Math.floor((this.browserScroll.getSize().y - current.getPosition(this.browserScroll).y) / current.getSize().y) - 1;
					if (stepsize < 1)
						stepsize = 1;
				}
				else {
					stepsize = Math.floor(this.browserScroll.getSize().y / current.getSize().y);
				}
			}
			/* fallthrough */
		case 'down':
			current.removeClass('hover');
			current = current.getParent('li');
			//if (typeof console !== 'undefined' && console.log) console.log('key DOWN: stepsize = ' + stepsize);
			for ( ; stepsize > 0; stepsize--) {
				var next = current.getNext('li');
				if (next == null)
					break;
				current = next;
			}
			current = current.getElement('span.fi');
			current.addClass('hover');
			this.Current = current;
			//if (typeof console !== 'undefined' && console.log) console.log('key DOWN: current Y = ' + current.getPosition(this.browserScroll).y + ', H = ' + this.browserScroll.getSize().y + ', 1U = ' + current.getSize().y);
			if (current.getPosition(this.browserScroll).y + current.getSize().y * 2 >= this.browserScroll.getSize().y)
			{
				// make scroll duration slightly dependent on the distance to travel:
				var dy = (current.getPosition(this.browserScroll).y + current.getSize().y * 2 - this.browserScroll.getSize().y);
				dy = 50 * dy / this.browserScroll.getSize().y;
				//if (typeof console !== 'undefined' && console.log) console.log('key UP: DUR: ' + dy);
				var browserScrollFx = new Fx.Scroll(this.browserScroll, { duration: (dy < 150 ? 150 : dy > 1000 ? 1000 : parseInt(dy)) });
				browserScrollFx.toElement(current);
			}
			break;

		// go up
		case 'home':
			stepsize = 1E5;
			/* fallthrough */
		case 'pageup':
			if (stepsize == 1) {
				// when at the top of the viewport, a full page scroll already happens /visually/ when you go up 1: that one will end up at the /bottom/, after all.
				stepsize = Math.floor(current.getPosition(this.browserScroll).y / current.getSize().y);
				if (stepsize < 1)
					stepsize = 1;
			}
			/* fallthrough */
		case 'up':
			current.removeClass('hover');
			current = current.getParent('li');
			//if (typeof console !== 'undefined' && console.log) console.log('key UP: stepsize = ' + stepsize);
			for ( ; stepsize > 0; stepsize--) {
				var previous = current.getPrevious('li');
				if (previous == null)
					break;
				current = previous;
			}
			current = current.getElement('span.fi');
			current.addClass('hover');
			this.Current = current;
			//if (typeof console !== 'undefined' && console.log) console.log('key UP: current Y = ' + current.getPosition(this.browserScroll).y + ', H = ' + this.browserScroll.getSize().y + ', 1U = ' + current.getSize().y + ', SCROLL = ' + this.browserScroll.getScroll().y + ', SIZE = ' + this.browserScroll.getSize().y);
			if (current.getPosition(this.browserScroll).y <= current.getSize().y) {
				var sy = this.browserScroll.getScroll().y + current.getPosition(this.browserScroll).y - this.browserScroll.getSize().y + current.getSize().y * 2;

				// make scroll duration slightly dependent on the distance to travel:
				var dy = this.browserScroll.getScroll().y - sy;
				dy = 50 * dy / this.browserScroll.getSize().y;
				//if (typeof console !== 'undefined' && console.log) console.log('key UP: SY = ' + sy + ', DUR: ' + dy);
				var browserScrollFx = new Fx.Scroll(this.browserScroll, { duration: (dy < 150 ? 150 : dy > 1000 ? 1000 : parseInt(dy)) });
				browserScrollFx.start(current.getPosition(this.browserScroll).x, (sy >= 0 ? sy : 0));
			}
			break;

		// select
		case 'enter':
			this.storeHistory = true;
			this.Current = current;
			if(this.browser.getElement('span.fi.selected') != null) // remove old selected one
				this.browser.getElement('span.fi.selected').removeClass('selected');
			current.addClass('selected');
			var currentFile = current.retrieve('file');
			//if (typeof console !== 'undefined' && console.log) console.log('on key ENTER file = ' + currentFile.mime + ': ' + currentFile.path + ', source = ' + 'retrieve');
			if(currentFile.mime == 'text/directory') {
				this.load(currentFile.dir + currentFile.name /*.replace(this.root,'')*/);
			}
			else {
				this.fillInfo(currentFile);
			}
			break;

		// delete file/directory:
		case 'delete':
			this.storeHistory = true;
			this.Current = current;
			current.removeClass('hover');
			if(this.browser.getElement('span.fi.selected') != null) // remove old selected one
				this.browser.getElement('span.fi.selected').removeClass('selected');

			// and before we go and delete the entry, see if we pick the next one down or up as our next cursor position:
			var parent = current.getParent('li');
			var next = parent.getNext('li');
			if (next == null) {
				next = parent.getPrevious('li');
			}
			if (next != null) {
				next.addClass('hover');
			}

			var currentFile = current.retrieve('file');
			//if (typeof console !== 'undefined' && console.log) console.log('on key DELETE file = ' + currentFile.mime + ': ' + currentFile.path + ', source = ' + 'retrieve');
			this.destroy(currentFile);

			this.Current = next;
			// TODO: scroll to center the new item in view; multiple DELETE actions should not 'walk off the screen'.
			break;
		}
	},

	fill: function(j, nofade) {

		// abort any still running ('antiquated') fill chunks -- should have been done in the last 'view' request, but better safe than sorry:
		$clear(this.view_fill_timer);

		// as this is a long-running process, make sure the hourglass-equivalent is visible for the duration:
		//this.browserLoader.set('opacity', 1);

		//this.browser_dragndrop_info.setStyle('visibility', 'visible');
		this.browser_dragndrop_info.set('opacity', 0.5);
		this.browser_dragndrop_info.setStyle('background-position', '0px -16px');
		this.browser_dragndrop_info.set('title', this.language.drag_n_drop_disabled);

		// keyboard navigation sets the 'hover' class on the 'current' item: remove any of those:
		this.browser.getElements('span.fi.hover').each(function(span){ span.removeClass('hover'); });

		this.Directory = j.path;
		this.CurrentDir = j.dir;
		if (!nofade && !this.onShow) {
			//if (typeof console !== 'undefined' && console.log) console.log('fill internal: fillInfo: file = ' + j.dir.name);
			this.fillInfo(j.dir);
		}
		this.browser.empty();
		this.root = j.root;
		var self = this;

		// set history
		if(typeof jsGET != 'undefined' && this.storeHistory && j.dir.mime == 'text/directory')
			jsGET.set({'fmPath':j.path});

		this.CurrentPath = this.root + this.Directory;
		var text = [], pre = [];
		// on error reported by backend, there WON'T be a JSON 'root' element at all times:
		//
		// TODO: how to handle that error condition correctly?
		if (!j.root)
		{
			new Dialog(('${error}: ' + j.error).substitute(this.language, /\\?\$\{([^{}]+)\}/g) , {language: {confirm: this.language.ok}, buttons: ['confirm']});
			return;
		}
		var rootPath = j.root.slice(0,-1).split('/');
		rootPath.pop();
		this.CurrentPath.split('/').each(function(folderName){
			if (!folderName) return;

			pre.push(folderName);
			var path = ('/'+pre.join('/')+'/').replace(j.root,'');
			//if (typeof console !== 'undefined' && console.log) console.log('on fill file = ' + j.root + ' : ' + path + ' : ' + folderName + ', source = ' + 'JSON');
			// add non-clickable path
			if(rootPath.contains(folderName)) {
				text.push(new Element('span', {'class': 'icon',text: folderName}));
			// add clickable path
			} else {
				text.push(new Element('a', {
						'class': 'icon',
						href: '#',
						text: folderName
					}).addEvent('click', function(e){
						e.stop();
						self.load(path);
					})
				);
			}
			text.push(new Element('span', {text: ' / '}));
		});

		text.pop();
		text[text.length-1].addClass('selected').removeEvents('click').addEvent('click', function(e) {
			e.stop();
		});
		this.selectablePath.set('value','/'+this.CurrentPath);
		this.clickablePath.empty().adopt(new Element('span', {text: '/ '}), text);

		if (!j.files) {
			return;
		}

		// ->> generate browser list
		var els = [[], []];

		/*
		 * For very large directories, where the number of directories in there and/or the number of files is HUGE (> 200),
		 * we DISABLE drag&drop functionality.
		 *
		 * Yes, we could have opted for the alternative, which is splitting up the .makeDraggable() activity in multiple
		 * setTimeout(callback, 0) initiated chunks in order to spare the user the hassle of a 'slow script' dialog,
		 * but in reality drag&drop is ludicrous in such an environment; currently we do not (yet) support autoscrolling
		 * the list to enable drag&dropping it to elements further away that the current viewport can hold at the same time,
		 * but drag&drop in a 500+ image carrying directory is resulting in a significant load of the browser anyway;
		 * alternative means to move/copy files should be provided in such cases instead.
		 *
		 * Hence we run through the list here and abort / limit the drag&drop assignment process when the hardcoded number of
		 * allow_drag_n_drop_now directories or files have been reached.
		 *
		 * TODO: make these numbers 'auto adaptive' based on timing measurements: how long does it take to initialize
		 *       a view on YOUR machine? --> adjust limits accordingly.
		 */
		var allow_drag_n_drop_now = (j.files.length < 1000);
		var starttime = new Date().getTime();
		//if (typeof console !== 'undefined' && console.log) console.log('fill list size = ' + j.files.length);

		this.view_fill_timer = this.fill_chunkwise_1.delay(1, this, [j, 0, allow_drag_n_drop_now, starttime, els]);
	},

	/*
	 The old one-function-does-all fill() would take an awful long time when processing large directories. This function
	 contains the most costly code chunk of the old fill() and has adjusted the looping through the j.files[] list
	 in such a way that we can 'chunk it up': we can measure the time consumed so far and when we have spent more than
	 X milliseconds in the loop, we stop and allow the loop to commence after a minimal delay.

	 The delay is the way to relinquish control to the browser and as a thank-you NOT get the dreaded
	 'slow script, continue or abort?' dialog in your face. Ahh, the joy of cooperative multitasking is back again! :-)
	*/
	fill_chunkwise_1: function(j, startindex, allow_drag_n_drop_now, starttime, els) {

		var idx;
		var self = this;
		var loop_starttime = new Date().getTime();

		var duration = new Date().getTime() - starttime;
		//if (typeof console !== 'undefined' && console.log) console.log(' + fill_chunkwise_1(' + startindex + ') @ ' + duration);

		for (idx = startindex; idx < j.files.length; idx++)
		{
			var file = j.files[idx];

			if (idx % 10 == 0) {
				// try not to spend more than 100 msecs per (UI blocking!) loop run!
				var loop_duration = new Date().getTime() - loop_starttime;
				//if (typeof console !== 'undefined' && console.log) console.log('time taken so far = ' + duration + ' / ' + loop_duration + ' @ elcnt = ' + idx);
				if (loop_duration >= 100)
				{
					this.view_fill_timer = this.fill_chunkwise_1.delay(1, this, [j, idx, allow_drag_n_drop_now, starttime, els]);
					return; // end call == break out of loop
				}
			}

			file.dir = j.path;
			var largeDir = '';
			//// generate unique id
			//var newDate = new Date;
			//uniqueId = newDate.getTime();

			//if (typeof console !== 'undefined' && console.log) console.log('thumbnail: "' + file.thumbnail + '"');
			//var icon = (this.listType == 'thumb') ? new Asset.image(file.thumbnail /* +'?'+uniqueId */, {'class':this.listType}) : new Asset.image(file.thumbnail);
			var isdir = (file.mime == 'text/directory');

			var el = file.element = new Element('span', {'class': 'fi ' + this.listType, href: '#'}).adopt(
				new Element('span', {
					'class': this.listType,
					'style': 'background-image: url(' + file.thumbnail + ')'
				}) /* .adopt(icon) */ ,
				new Element('span', {'class': 'filename', text: file.name, title:file.name})
			).store('file', file);

			// add click event, only to directories, files use the revert function (to enable drag n drop)
			// OR provide a basic click event for files too IFF this directory is too huge to support drag & drop.
			if(isdir || !allow_drag_n_drop_now) {
				el.addEvent('click',this.relayClick);
			}

			// -> add icons
			var icons = [];
			// download icon
			if(!isdir && this.options.download) {
				icons.push(new Asset.image(this.assetBasePath + 'Images/disk.png', {title: this.language.download}).addClass('browser-icon').addEvent('mouseup', (function(e){
					e.preventDefault();
					el.store('edit',true);
					//if (typeof console !== 'undefined' && console.log) console.log('download: ' + file.path + ', ' + this.normalize(file.path));
					window.open(this.options.url + (this.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, this.options.propagateData, {
						event: 'download',
						file: this.normalize(file.dir + file.name),
						filter: this.options.filter
					})));
				}).bind(this)).inject(el, 'top'));
			}

			// rename, delete icon
			if(file.name != '..') {
				var editButtons = new Array();
				if(this.options.rename) editButtons.push('rename');
				if(this.options.destroy) editButtons.push('destroy');
				editButtons.each(function(v){
					icons.push(new Asset.image(this.assetBasePath + 'Images/' + v + '.png', {title: this.language[v]}).addClass('browser-icon').addEvent('mouseup', (function(e){
						e.preventDefault();
						el.store('edit',true);
						this.tips.hide();
						this[v](file);
					}).bind(this)).inject(el,'top'));
				}, this);
			}

			els[isdir ? 1 : 0].push(el);
			//if (file.name == '..') el.set('opacity', 0.7);
			el.inject(new Element('li',{'class':this.listType}).inject(this.browser)).store('parent', el.getParent());
			icons = $$(icons.map((function(icon){
				this.showFunctions(icon,icon,0.5,1);
				this.showFunctions(icon,el.getParent('li'),1);
			}).bind(this)));

			// ->> LOAD the FILE/IMAGE from history when PAGE gets REFRESHED (only directly after refresh)
			if(this.onShow && typeof jsGET != 'undefined' && jsGET.get('fmFile') != null && file.name == jsGET.get('fmFile')) {
				this.deselect();
				this.Current = file.element;
				new Fx.Scroll(this.browserScroll,{duration: 250,offset:{x:0,y:-(this.browserScroll.getSize().y/4)}}).toElement(file.element);
				file.element.addClass('selected');
				//if (typeof console !== 'undefined' && console.log) console.log('fill: fillInfo: file = ' + file.name);
				this.fillInfo(file);
			} else if(this.onShow && jsGET.get('fmFile') == null) {
				this.onShow = false;
			}
		}

		// check how much we've consumed so far:
		duration = new Date().getTime() - starttime;
		//if (typeof console !== 'undefined' && console.log) console.log('time taken in array traversal = ' + duration);
		//starttime = new Date().getTime();

		// go to the next stage, right after these messages... ;-)
		this.view_fill_timer = this.fill_chunkwise_2.delay(1, this, [j, allow_drag_n_drop_now, starttime, els]);
	},

	/*
	See comment for fill_chunkwise_1(): the makeDraggable() is a loop in itself and taking some considerable time
	as well, so make it happen in a 'fresh' run here...
	*/
	fill_chunkwise_2: function(endindex, allow_drag_n_drop_now, starttime, els) {

		var self = this;

		var duration = new Date().getTime() - starttime;
		//if (typeof console !== 'undefined' && console.log) console.log(' + fill_chunkwise_2() @ ' + duration);

		// -> cancel dragging
		var revert = function(el) {
			el.set('opacity', 1).removeClass('drag').removeClass('move').setStyles({
				opacity: 1,
				'z-index': 'auto',
				position: 'relative',
				width: 'auto',
				left: 0,
				top: 0
			}).inject(el.retrieve('parent'));
			// also dial down the opacity of the icons within this row (download, rename, delete):
			var icons = el.getElements('img.browser-icon');
			if (icons) {
				icons.each(function(icon) {
					icon.set('opacity', 0.0);
				});
			}

			//if (typeof console !== 'undefined' && console.log) console.log('REMOVE keyboard up/down on revert');
			document.removeEvent('keydown', self.bound.keydown).removeEvent('keyup', self.bound.keyup);
			self.imageadd.fade(0);

			self.relayClick.apply(el);
		};

		// check how much we've consumed so far:
		duration = new Date().getTime() - starttime;
		//if (typeof console !== 'undefined' && console.log) console.log('time taken in array traversal + revert = ' + duration);
		//starttime = new Date().getTime();

		if (allow_drag_n_drop_now) {
			// -> make draggable
			$$(els[0]).makeDraggable({
				droppables: $$(this.droppables.combine(els[1])),
				//stopPropagation: true,

				onDrag: function(el, e){
					self.imageadd.setStyles({
						'left': e.page.x + 25,
						'top': e.page.y + 25
					});
					self.imageadd.fade('in');
				},

				onBeforeStart: function(el){
					//if (typeof console !== 'undefined' && console.log) console.log('draggable:onBeforeStart');
					self.deselect();
					self.tips.hide();
					var position = el.getPosition();
					el.addClass('drag').setStyles({
						'z-index': self.dragZIndex,
						'position': 'absolute',
						'width': el.getWidth() - el.getStyle('paddingLeft').toInt() - el.getStyle('paddingRight').toInt(),
						'left': position.x,
						'top': position.y
					}).inject(self.container);
				},

				onCancel: revert,

				onStart: function(el){
					//if (typeof console !== 'undefined' && console.log) console.log('draggable:onStart');
					el.set('opacity', 0.7).addClass('move');
					//if (typeof console !== 'undefined' && console.log) console.log('add keyboard up/down on drag start');
					document.addEvents({
						keydown: self.bound.keydown,
						keyup: self.bound.keyup
					});
				},

				onEnter: function(el, droppable){
					droppable.addClass('droppable');
				},

				onLeave: function(el, droppable){
					droppable.removeClass('droppable');
				},

				onDrop: function(el, droppable, e){
					//if (typeof console !== 'undefined' && console.log) console.log('draggable:onDrop');

					var is_a_move = !(e.control || e.meta);
					self.drop_pending = 1 + is_a_move;

					if (!is_a_move || !droppable) el.setStyles({left: 0, top: 0});
					if (is_a_move && !droppable) {
						self.drop_pending = 0;

						revert(el);   // go and request the details anew, then refresh them in the view
						return;
					}

					revert(el);		// do not send the 'detail' request in here: self.drop_pending takes care of that!

					var dir;
					if (droppable){
						droppable.addClass('selected').removeClass('droppable');
						(function() {
							droppable.removeClass('selected');
						}).delay(300);
						if (self.onDragComplete(el, droppable)) {
							self.drop_pending = 0;
							return;
						}

						dir = droppable.retrieve('file');
						//if (typeof console !== 'undefined' && console.log) console.log('on drop dir = ' + dir.dir + ' : ' + dir.name + ', source = ' + 'retrieve');
					}
					var file = el.retrieve('file');
					//if (typeof console !== 'undefined' && console.log) console.log('on drop file = ' + file.name + ' : ' + self.Directory + ', source = ' + 'retrieve; droppable = "' + droppable + '"');

					new FileManager.Request({
						url: self.options.url + (self.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, self.options.propagateData, {
							event: 'move'
						})),
						data: {
							file: file.name,
							filter: self.options.filter,
							directory: self.Directory,
							newDirectory: dir ? (dir.dir ? dir.dir + '/' : '') + dir.name : self.Directory,
							copy: is_a_move ? 0 : 1
						},
						onSuccess: (function(j) {
							if (!j || !j.status) {
								// TODO: include j.error in the message, iff j.error exists
								new Dialog(('' + j.error).substitute(this.language, /\\?\$\{([^{}]+)\}/g) , {language: {confirm: this.language.ok}, buttons: ['confirm']});
								this.browserLoader.fade(0);
								return;
							}
							if (!dir) {
								this.load(this.Directory);
							}
							this.browserLoader.fade(0);
						}).bind(self),
						onError: (function(text, error) {
							this.showError(text);
							this.browserLoader.fade(0);
						}).bind(self),
						onFailure: (function(xmlHttpRequest) {
							var text = this.cvtXHRerror2msg(xmlHttpRequest);
							this.showError(text);
							this.browserLoader.fade(0);
						}).bind(self)
					}, self).send();

					self.fireEvent('modify', [Object.clone(file)]);

					el.fade(0).get('tween').chain(function(){
						el.getParent().destroy();
					});

					self.deselect(el);					// and here, once again, do NOT send the 'detail' request while the 'move' is still ongoing (*async* communications!)

					// the 'move' action will probably still be running by now, but we need this only to block simultaneous requests triggered from this run itself
					self.drop_pending = 0;
				}
			});

			this.browser_dragndrop_info.setStyle('background-position', '0px 0px');
			this.browser_dragndrop_info.set('title', this.language.drag_n_drop);
			//this.browser_dragndrop_info.setStyle('visibility', 'hidden');
		}

		// check how much we've consumed so far:
		duration = new Date().getTime() - starttime;
		//if (typeof console !== 'undefined' && console.log) console.log(' + time taken in make draggable = ' + duration);
		//starttime = new Date().getTime();

		$$(els[0].combine(els[1])).setStyles({'left': 0, 'top': 0});

		// check how much we've consumed so far:
		duration = new Date().getTime() - starttime;
		//if (typeof console !== 'undefined' && console.log) console.log(' + time taken in setStyles = ' + duration);

		this.view_fill_timer = null;

		this.tips.attach(this.browser.getElements('img.browser-icon'));
		this.browser_dragndrop_info.set('opacity', 1.0);
	},

	fillInfo: function(file) {

		var self = this;

		if (!file) file = this.CurrentDir;
		if (!file) return;

		// set file history
		//if (typeof console !== 'undefined' && console.log) console.log(this.storeHistory);
		if(typeof jsGET != 'undefined' && this.storeHistory) {
			if(file.mime != 'text/directory')
				jsGET.set({'fmFile':file.name});
			else
				jsGET.set({'fmFile':''});
		}

		var size = this.size(file.size);
		var icon = file.icon;

		this.switchButton();

		if (self.drop_pending != 2) {
			// only fade up when we are allowed to send a detail request next as well and we're doing a MOVE drop
			this.info.fade(1).getElement('img').set({
				src: icon,
				alt: file.mime
			});
		}
		else {
			this.info.getElement('img').set({
				src: icon,
				alt: file.mime
			});
		}

		this.fireHooks('cleanup');
		this.preview.empty();

		this.info.getElement('h1').set('text', file.name);
		this.info.getElement('h1').set('title', file.name);
		this.info.getElement('dd.filemanager-modified').set('text', file.date);
		this.info.getElement('dd.filemanager-type').set('text', file.mime);
		this.info.getElement('dd.filemanager-size').set('text', !size[0] && size[1] == 'Bytes' ? '-' : (size.join(' ') + (size[1] != 'Bytes' ? ' (' + file.size + ' Bytes)' : '')));
		this.info.getElement('h2.filemanager-headline').setStyle('display', file.mime == 'text/directory' ? 'none' : 'block');

		if (file.mime=='text/directory') return;

		if (self.drop_pending != 2) {
			if (this.Request) this.Request.cancel();

			this.Request = new FileManager.Request({
				url: this.options.url + (this.options.url.indexOf('?') == -1 ? '?' : '&') + Object.toQueryString(Object.merge({}, this.options.propagateData, {
					event: 'detail'
				})),
				data: {
					directory: this.Directory,
					file: file.name,
					filter: this.options.filter
				},
				onRequest: (function() {
					this.previewLoader.inject(this.preview);
					this.previewLoader.set('opacity', 1);
				}).bind(self),
				onSuccess: (function(j) {

					if (!j || !j.status) {
						// TODO: include j.error in the message, iff j.error exists
						new Dialog(('' + j.error).substitute(this.language, /\\?\$\{([^{}]+)\}/g) , {language: {confirm: this.language.ok}, buttons: ['confirm']});
						this.previewLoader.dispose();
						return;
					}

					this.previewLoader.fade(0).get('tween').chain((function() {
						this.previewLoader.dispose();

						var prev = this.preview.removeClass('filemanager-loading').set('html', j && j.content ? j.content.substitute(this.language, /\\?\$\{([^{}]+)\}/g) : '').getElement('img.preview');
						if (prev) prev.addEvent('load', function(){
							this.setStyle('background', 'none');
						});

						var els = this.preview.getElements('button');
						if (els) els.addEvent('click', function(e){
							e.stop();
							window.open(this.get('value'));
						});

						if(typeof milkbox != 'undefined')
							milkbox.reloadPageGalleries();

					}).bind(this));
				}).bind(self),
				onError: (function(text, error) {
					this.previewLoader.dispose();
					this.showError(text);
				}).bind(self),
				onFailure: (function(xmlHttpRequest) {
					this.previewLoader.dispose();
					var text = this.cvtXHRerror2msg(xmlHttpRequest);
					this.showError(text);
				}).bind(self)
			}, this).send();
		}
	},

	showFunctions: function(icon,appearOn,opacityBefore,opacityAfter) {
		var opacity = [opacityBefore || 1, opacityAfter || 0];
		icon.set({
			opacity: opacity[1],
		});

		$(appearOn).addEvents({
			mouseenter: (function(){this.setStyle('opacity',opacity[0]);}).bind(icon),
			mouseleave: (function(){this.setStyle('opacity',opacity[1]);}).bind(icon)
		});
		return icon;
	},

	size: function(size){
		var tab = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
		for(var i = 0; size > 1024; i++)
			size = size/1024;

		return [Math.round(size), tab[i]];
	},

	normalize: function(str){
		return str.replace(/\/+/g, '/');
	},

	switchButton: function() {
		var chk = !!this.Current;
		var els = new Array();
		els.push(this.menu.getElement('button.filemanager-open'));
		els.push(this.menu.getElement('button.filemanager-download'));
		els.each(function(el){
			if (el) el.set('disabled', !chk)[(chk ? 'remove' : 'add') + 'Class']('disabled');
		});
	},

	// adds buttons to the file main menu, which onClick start a method with the same name
	addMenuButton: function(name) {
		var el = new Element('button', {
			'class': 'filemanager-' + name,
			text: this.language[name]
		}).inject(this.menu, 'top');
		if (this[name]) el.addEvent('click', this[name].bind(this));
		return el;
	},

	fireHooks: function(hook){
		var args = Array.slice(arguments, 1);
		for(var key in this.hooks[hook]) this.hooks[hook][key].apply(this, args);
		return this;
	},

	cvtXHRerror2msg: function(xmlHttpRequest) {
		var status = xmlHttpRequest.status;
		var orsc = xmlHttpRequest.onreadystatechange;
		var response = (xmlHttpRequest.responseText || xmlHttpRequest.responseXML || '');

		var text = response.substitute(this.language, /\\?\$\{([^{}]+)\}/g);
		return text;
	},

	showError: function(text) {
		var errorText = text;
		var self = this;

		if (!errorText) {
			errorText = this.language.backend.unidentified_error;
		}
		else if (errorText.indexOf('{') != -1) {
			errorText = errorText.substring(0,errorText.indexOf('{'));
		}

		new Dialog(this.language.error, {
			buttons: ['confirm'],
			language: {
				confirm: this.language.ok
			},
			content: [
				errorText
			],
			onOpen: this.onDialogOpen.bind(this),
			onClose: this.onDialogClose.bind(this)
		});
	},

	onRequest: function(){
		this.loader.set('opacity', 1);
	},
	onComplete: function(){
		this.loader.fade(0);
	},
	onError: function(){
		this.loader.fade(0);
	},
	onFailure: function(){
		this.loader.fade(0);
	},
	onDialogOpen: function(){
		this.dialogOpen = true;
		this.onDialogOpenWhenUpload.apply(this);
	},
	onDialogClose: function(){
		this.dialogOpen = false;
		this.onDialogCloseWhenUpload.apply(this);
	},
	onDialogOpenWhenUpload: function(){},
	onDialogCloseWhenUpload: function(){},
	onDragComplete: Function.from(false)
});

FileManager.Request = new Class({
	Extends: Request.JSON,
	secure: true,

	initialize: function(options, filebrowser){
		this.parent(options);

		if (filebrowser) this.addEvents({
			request: filebrowser.onRequest.bind(filebrowser),
			complete: filebrowser.onComplete.bind(filebrowser),
			error: filebrowser.onError.bind(filebrowser),
			failure: filebrowser.onFailure.bind(filebrowser)
		});
	}
});

FileManager.Language = {};

(function(){

// ->> load DEPENDENCIES
var __DIR__ = (function() {
		var scripts = document.getElementsByTagName('script');
		var script = scripts[scripts.length - 1].src;
		var host = window.location.href.replace(window.location.pathname+window.location.hash,'');
		return script.substring(0, script.lastIndexOf('/')).replace(host,'') + '/';
})();
Asset.javascript(__DIR__+'../Assets/js/milkbox/milkbox.js');
Asset.css(__DIR__+'../Assets/js/milkbox/css/milkbox.css');
Asset.css(__DIR__+'../Assets/Css/FileManager.css');
Asset.css(__DIR__+'../Assets/Css/Additions.css');
Asset.javascript(__DIR__+'../Assets/js/jsGET.js', { events: {load: (function(){ window.fireEvent('jsGETloaded'); }).bind(this)}});

Element.implement({

	center: function(offsets) {
		var scroll = document.getScroll(),
			offset = document.getSize(),
			size = this.getSize(),
			values = {x: 'left', y: 'top'};

		if(!offsets) offsets = {};

		for (var z in values){
			var style = scroll[z] + (offset[z] - size[z]) / 2 + (offsets[z] || 0);
			this.setStyle(values[z], (z == 'y' && style < 30) ? 30 : style);
		}
		return this;
	}

});

this.Dialog = new Class({

	Implements: [Options, Events],

	options: {
		/*onShow: function(){},
		onOpen: function(){},
		onConfirm: function(){},
		onDecline: function(){},
		onClose: function(){},*/
		request: null,
		buttons: ['confirm', 'decline'],
		language: {}
	},

	initialize: function(text, options){
		this.setOptions(options);
		this.dialogOpen = false;

		this.el = new Element('div', {
			'class': 'dialog' + (Browser.ie ? ' dialog-engine-trident' : '') + (Browser.ie ? ' dialog-engine-trident' : '') + (Browser.ie8 ? '4' : '') + (Browser.ie9 ? '5' : ''),
			opacity: 0,
			tween: {duration: 250}
		}).adopt([
			typeOf(text) == 'string' ? new Element('div', {text: text}) : text
		]);

		if(typeof this.options.content != 'undefined') {
			this.options.content.each((function(content){
				if(content && typeOf(content) == 'element') this.el.getElement('div').adopt(content);
				else if(content) this.el.getElement('div').set('html',this.el.getElement('div').get('html')+'<br>'+content);
			}).bind(this));
		}

		Array.each(this.options.buttons, function(v){
			new Element('button', {'class': 'dialog-' + v, text: this.options.language[v]}).addEvent('click', (function(e){
				if (e) e.stop();
				this.fireEvent(v).fireEvent('close');
				//if(!this.options.hideOverlay)
				this.overlay.hide();
				this.destroy();
			}).bind(this)).inject(this.el);
		}, this);

		this.overlay = new Overlay({
			'class': 'overlay overlay-dialog',
			events: {click: this.fireEvent.pass('close',this)},
			tween: {duration: 250}
		});

		this.bound = {
			scroll: (function(){
				if (!this.el) this.destroy();
				else this.el.center();
			}).bind(this),
			keyesc: (function(e){
				//if (typeof console !== 'undefined' && console.log) console.log('keyEsc: key press: ' + e.key);
				if (e.key == 'esc') {
					e.stopPropagation();
					this.fireEvent('close').destroy();
				};
			}).bind(this)
		};

		this.show();
	},

	show: function(){
		if(!this.options.hideOverlay)
			this.overlay.show();
		var self = this.fireEvent('open');
		this.el.setStyle('display', 'block').inject(document.body).center().fade(1).get('tween').chain(function(){
			var button = this.element.getElement('button.dialog-confirm') || this.element.getElement('button');
			if (button) button.focus();
			self.fireEvent('show');
		});

		//if (typeof console !== 'undefined' && console.log) console.log('add key up(ESC)/resize/scroll on show 1500');
		document.addEvents({
			'scroll': this.bound.scroll,
			'resize': this.bound.scroll,
			'keyup': this.bound.keyesc
		});
	},

	destroy: function() {
		if (this.el) {
			this.el.fade(0).get('tween').chain((function(){
				if(!this.options.hideOverlay)
					this.overlay.destroy();
				this.el.destroy();
			}).bind(this));
		}
		//if (typeof console !== 'undefined' && console.log) console.log('remove key up(ESC) on destroy');
		document.removeEvent('scroll', this.bound.scroll).removeEvent('resize', this.bound.scroll).removeEvent('keyup', this.bound.keyesc);
	}

});

this.Overlay = new Class({

	initialize: function(options){
		this.el = new Element('div', Object.append({
			'class': 'overlay'
		}, options)).inject(document.body);
	},

	show: function(){
		this.objects = $$('object, select, embed').filter(function(el){
			return el.id == 'SwiffFileManagerUpload' || el.style.visibility == 'hidden' ? false : !!(el.style.visibility = 'hidden');
		});

		this.resize = (function(){
			if (!this.el) this.destroy();
			else this.el.setStyles({
				width: document.getScrollWidth(),
				height: document.getScrollHeight()
			});
		}).bind(this);

		this.resize();

		this.el.setStyles({
			opacity: 0,
			display: 'block'
		}).get('tween').pause().start('opacity', 0.5);

		window.addEvent('resize', this.resize);

		return this;
	},

	hide: function(){
		if(!Browser.ie) {
			this.el.fade(0).get('tween').chain((function(){
				this.revertObjects();
				this.el.setStyle('display', 'none');
			}).bind(this));
		} else {
			this.revertObjects();
			this.el.setStyle('display', 'none');
		}

		window.removeEvent('resize', this.resize);

		return this;
	},

	destroy: function(){
		this.revertObjects().el.destroy();
	},

	revertObjects: function(){
		if (this.objects && this.objects.length) {
			this.objects.each(function(el){
				el.style.visibility = 'visible';
			});
		}

		return this;
	}

});

})();


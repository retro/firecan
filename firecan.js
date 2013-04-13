steal('can/util', 'can/observe', 'can/observe/list', 'can/construct/proxy', function( can ) {

	var modelNum = 0,
		getId = function( inst ) {
			// Instead of using attr, use __get for performance.
			// Need to set reading
			can.Observe.__reading && can.Observe.__reading(inst, inst.constructor.id)
			return inst.__get(inst.constructor.id);
		},
		getData = function(snapshot){
			var data = snapshot.val() || {};
			data.id  = snapshot.name();
			return data
		}


	var FirecanCollection = can.Observe.List({}, {
		setup : function(model, firebase, params){
			can.Observe.List.prototype.setup.call(this)
			this._model = model;
			firebase.on('child_added', this.proxy('_addChild'));
			firebase.on('child_removed', this.proxy('_removeChild'));
			firebase.on('child_moved', this.proxy('_moveChild'));
		},
		_addChild : function(snapshot, prevSiblingId){
			var data  = getData(snapshot),
				model = this._model.model(data)
				prevSibling      = prevSiblingId ? this._model.store[prevSiblingId] : null,
				prevSiblingIndex = prevSibling ? this.indexOf(prevSibling) : -1;

			this.splice(prevSiblingIndex + 1, 0, model)
			
		},
		_removeChild : function(snapshot){
			var id    = snapshot.name(),
				index = -1;
			for(var i = 0; i < this.length; i++){
				if(this[i].id === id){
					index = i;
					break;
				}
			}
			if(index !== -1){
				this.splice(index, 1);
			}
		},
		_moveChild : function(snapshot, prevSiblingId){
			var data             = getData(snapshot),
				model            = this._model.model(data),
				prevSibling      = prevSiblingId ? this._model.store[prevSiblingId] : null,
				modelIndex       = this.indexOf(model),
				prevSiblingIndex = prevSibling ? this.indexOf(prevSibling) : -1;
			can.Observe.startBatch();
			this.splice(modelIndex, 1);
			this.splice(prevSiblingIndex + 1, 0, model)
			can.Observe.stopBatch();
		}
	})

	var Firecan = can.Observe({
		list : null,
		id   : 'id',
		collection : function(params){
			if(this.list === null){
				throw 'You must define list endpoint for the Firecan model!'
			}
			
			return new FirecanCollection(this, this._getFirebase(), params);
		},
		get : function(name){
			return new this({}, this._getFirebase(name));
		},
		_getFirebase : function(name){

			name = name ? "/" + name : "";

			return new Firebase(this.list + name);
		},
		setup : function(){
			this.store = {};
		},
		model: function( attributes ) {
			if ( ! attributes ) {
				return;
			}
			if ( attributes instanceof this ) {
				attributes = attributes.serialize();
			}
			var id = attributes[ this.id ],
				model = (id || id === 0) && this.store[id] ?
					this.store[id].attr(attributes, this.removeAttr || false) : new this( attributes );
			
			this.store[attributes[this.id]] = model;
			
			return model;
		}
	}, {
		setup : function(attributes){
			can.Observe.prototype.setup.call(this, (attributes || {}));

			if(attributes.id){
				this._firebaseRef = this.constructor._getFirebase(attributes.id);
			} else {
				this._firebaseRef = this.constructor._getFirebase().push();
			}
			
			this._firebaseRef.on('value', this.proxy('_setFromFirebase'));
			
		},
		_setFromFirebase : function(snapshot){
			var val = snapshot.val();
			if(val){
				this.attr('id', this._firebaseRef.name());
				this.attr(snapshot.val());
				this._triggerEv && this._triggerEvents(this._triggerEv);
				delete this._triggerEv;
			}
		},
		_triggerEvents : function(ev){
			can.trigger(this, ev);
			can.trigger(this.constructor, ev, this);
		},
		save : function(){
			var data = this.attr();
			if(data.id){
				delete data.id
				this._triggerEv = 'updated';
			} else {
				this._triggerEv = 'created';
			}
			this._firebaseRef.setWithPriority(data, this.getPriority());
		},
		destroy : function(){
			this._firebaseRef.remove(this.proxy(function(){
				this._triggerEvents('destroyed')
			}));
		},
		bind: function(eventName){
			if ( ! this._bindings ) {
				var id = this.__get(this.constructor.id);
				if(id){
					this.constructor.store[id] = this;
				}
				this._bindings = 0;
			}
			this._bindings++;
			
			return can.Observe.prototype.bind.apply( this, arguments );
		},
		unbind : function(eventName){
			this._bindings--;
			if(!this._bindings){
				delete this.constructor.store[getId(this)];
			}
			return can.Observe.prototype.unbind.apply(this, arguments);
		},
		getPriority : function(){
			return null;
		},
		// Change `id`.
		___set: function( prop, val ) {
			can.Observe.prototype.___set.call(this,prop, val)
			// If we add an `id`, move it to the store.
			if(prop === this.constructor.id && this._bindings){
				this.constructor.store[getId(this)] = this;
			}
		}
	})
	return Firecan;
})
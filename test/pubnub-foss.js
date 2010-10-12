require.paths.unshift('./.node_libraries');

var vows = require('vows'),
	assert = require('assert'),
	events = require('events');

var PUBNUB = new require('pubnub-client').PUBNUB("demo", "demo", "127.0.0.1", 8080);

exports.suite = vows.describe('PubNub Client').addBatch(
	{ 
		'Request Time':
		{
			topic: function()
			{
				PUBNUB.time(this.callback);
			},
			'check response code is 200': function (r, e) 
			{
				assert.equal(r.status, 200);
			},
			'check time returned is not Zero': function (r, e) 
			{
				assert.isNotZero(r.time);
			},
		},
		
		'Request UUID':
		{
			topic: function()
			{
				PUBNUB.uuid(this.callback);
			},
			'check response code is 200': function (r, e) 
			{
				assert.equal(r.status, 200);
			},
			'check uuid format is correct': function (r, e) 
			{
				assert.match(r.uuid, /^[a-f\d]{8}\-[a-f\d]{4}\-[a-f\d]{4}\-[a-f\d]{4}\-[a-f\d]{12}/);
			}
		},
			
		
		'Publish a message on channel `demo`': 
		{
			topic: function()
			{
				PUBNUB.publish('demo', {'testing': '1,2,3,4,5'}, this.callback);
			},

			'check if response code is 200': function (r, e) 
			{
				assert.equal(r.status, 200);
			},
		},

		'Subscribe to channel `demo2`':
		{
			topic: function()
			{
				PUBNUB.subscribe('demo2', this.callback);
				setTimeout(function(){PUBNUB.publish('demo2', {'testing': '1,2,3'})}, 1000);
			},
			
			'Received test message & unsubscribe':  function (r, e)
			{
				assert.deepEqual(r[0], {'testing': '1,2,3'});
				PUBNUB.unsubscribe('demo2');
			},

		},

	
		

});

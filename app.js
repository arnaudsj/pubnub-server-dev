require.paths.unshift('./.node_libraries');

DEBUG = 1;

var sys = require('sys'),
	express = require('express'),
	redis = require("redis"),
	EventEmitter = require('node-evented').EventEmitter;

// every 10 seconds poll for the memory.
var mem = process.memoryUsage();
setInterval(function () {
	mem = process.memoryUsage();
	sys.log( (mem.rss / (1024*2)) + ' Mo used');
}, 10*1000);
   
var redPublisher = redis.createClient();
var redDataClient = redis.createClient();


var redXdrTimeOutReq = {};
var redCallBackEvents = {};

var p = {
	debug: function(m)
		{
			if (DEBUG)
			{
				console.log(m);
			}
		}
};


/* PubSub Core */
var redPSubscriber = redis.createClient();
redPSubscriber.on("psubscribe", function(pattern, count)
{
	p.debug("persistent redis client waiting for messages on channel with pattern:"+pattern);
})

redPSubscriber.on("pmessage", function (pattern, channel, message) 
{
	var timeToken = +new Date;
	var messageString = JSON.stringify(
		{
			timeToken: timeToken,
			message: message.toString()
		}
	);

	var chan = channel.substring(1);

	p.debug("("+pattern+") received message on channel: "+chan+" \\n"+messageString);

	redDataClient.zadd( chan, timeToken.toString(), messageString, 
		function(error, replies)
		{
			var storeChannel = "s/"+chan;
			p.debug("stored message, sending ping on " + storeChannel + " to all internal polling clients on that channel");
			redPublisher.publish(storeChannel, timeToken);
		}
	);
});
redPSubscriber.psubscribe("/*");

var redPDataSub = redis.createClient();
redPDataSub.on("psubscribe", function(pattern, count)
{
	p.debug("persistent redis client waiting for messages on store channel with pattern:"+pattern);
})
redPDataSub.on("pmessage", function (pattern, channel, message)
{
	var chan = channel.substring(2);
	
	if (typeof redCallBackEvents[chan] !== 'undefined')
	{
		p.debug("got message, trying to fire calback!");		 
		redCallBackEvents[chan].emit("message", channel);
	}
	else
	{
		p.debug("got message but no callBack waiting :(");
	}
});
redPDataSub.psubscribe("s/*");


/* Express App */

var app = express.createServer();

app.configure(function(){
    app.use(express.methodOverride());
    //app.use(express.bodyDecoder());
    app.use(app.router);
	app.set('view engine', 'ejs');
	app.set('view options', {
	    layout: false
	});
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	redPublisher.flushdb();
});

// js-api?pub-key=7795f1ac-fa60-414e-b01a-0d5ec643b4cb&sub-key=752a4eb0-b502-11df-a256-2f52a4db9804
app.get('/js-api', function(req, res)
{
	res.render('pubnub.ejs', {
		locals: {
			hostname: process.argv[4],
			port: process.argv[3],
			pubKey: req.param("pub-key"),
			subKey: req.param("sub-key"),
		},
		headers: { 'Content-Type': 'application/javascript' }
	});
});

app.get('/pubnub-x-origin', function(req, res) 
{
	var unique = req.param("unique");

	pubnubResponse = {
		"x-origin": 1
	}
	
    res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' }, 200);
});

app.get('/pubnub-time', function(req, res) 
{
	var unique = req.param("unique");
	
	pubnubResponse = {
		status: 200,
		time: (+new Date)
	}
	
    res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' }, 200);
});

app.get('/pubnub-uuid', function(req, res) 
{
	var unique = req.param("unique");	
	
	// FIXME: Find better way to generate unique ID (and store it?)
    var generate = function(l)
	{
		var result = "";
		for (var i=0; i<l; i++)
		{
			var rand = Math.floor(Math.random(+new Date)*16);
			result += String.fromCharCode(48 + (rand<10?rand:rand+39) );
		}
		return result;
	}

	var pubnubResponse = {
		status: 200,
		uuid: (generate(8)+'-'+generate(4)+'-'+generate(4)+'-'+generate(4)+'-'+generate(12))
	}
	
    res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' }, 200);
});

app.get('/pubnub-publish', function(req, res) 
{
	var channel = req.param("channel");
	var message = req.param("message");
	var unique = req.param("unique");
	
	// TODO: Check subscribe key & publish key

	p.debug("received (ch "+ channel +"): "+ message);
	
	// We only need ONE redisClient in async to publish!
	redPublisher.publish("/"+channel, message);

	var pubnubResponse = {
		status: 200
	};

	res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' },  200);
});

app.get('/pubnub-subscribe', function(req, res) 
{
	var channel = req.param("channel");
	var unique = req.param("unique");
	
	// Setup our event Emitter for that channel if it does not already exist!
	if (typeof redCallBackEvents[channel] === 'undefined')
	{
		redCallBackEvents[channel] = new EventEmitter();
		p.debug('created event emitter for channel:'+channel);
	}
	
	
	// Tell the client where to poll from!
	res.send('window["'+unique+'"](' + JSON.stringify({status: 200, server: process.argv[4]+":"+process.argv[3]}) + ')', { 'Content-Type': 'application/javascript' },  200);
});


app.get('/', function(req, res)
{
	var channel = req.param("channel"),
		timeToken = req.param("timetoken") || 0,
		unique = req.param("unique");
		
	var responseString = "";
		
	p.debug("polling request for: " + channel + "/" + timeToken);
	
	//var tempClient = redis.createClient();
	
	// Auto correct request with timeToken = 0, because they will get the whole history of channel!
	if (timeToken == 0)
	{
		timeToken = (+new Date) - 1;
		//p.debug("auto corrected timeToken to: " + timeToken);
	}
	
	// Make sure we send a reply within 30 sec if nothing happens!
	var uniqueHash = channel+'/'+timeToken+'/'+unique;
	redXdrTimeOutReq[uniqueHash] = setTimeout( function() 
		{ 
			// Create timeout message
			responseString = JSON.stringify({
				messages : ['xdr.timeout'],
				timetoken: +new Date
			});

			p.debug("Xdr timeout for: "+uniqueHash);
			
			res.send('window["'+unique+'"]('+responseString+')', { 'Content-Type': 'application/javascript' }, 200);
		},
	25000);

	// Query if we have any messages stored 
	redDataClient.zrangebyscore(channel, "("+timeToken, "+inf", function(error, replies) 
	{
		p.debug("querying redis zrange for"+ channel + " / " + (timeToken) + "=> "+ replies);
		if (replies.toString() !== "") 
		{
			var messages = JSON.parse('['+replies.toString()+']');
			var maxTimeToken = +new Date;
			var messageList = [];

			for (var i=0; i<messages.length; i++)
			{
				if (messages[i].timeToken > maxTimeToken)
				{
					maxTimeToken = messages[i].timeToken;
				}

				messageList.push(JSON.parse(messages[i].message));
			}

			responseString = JSON.stringify({
				messages : messageList,
				timetoken: maxTimeToken
			});

			// Here slightly different, we can't unsubsribe!
			clearTimeout(redXdrTimeOutReq[uniqueHash]);
			delete redXdrTimeOutReq[uniqueHash];

			p.debug("poll response for (via zrange): "+uniqueHash+"\n"+ responseString);
			res.send('window["'+unique+'"]('+responseString+')', { 'Content-Type': 'application/javascript' }, 200);
		}
		else
		// No records in Redis, let's subscribe to our internal store channel!
		{	
			redCallBackEvents[channel].on("message", function(ch)
				{
					// First clean up! We don't want another one to fire ;)
					this.removeListener("message");
					
					// Need to test here if client is still connected, if not then return and we're done!
					
					var chan = ch.substring(2); // to trime the s/ in s/pub-key/channel

					p.debug("**** querying redis zrange for"+  chan + " / " + (timeToken+1));
					redDataClient.zrangebyscore(chan, "("+timeToken, "+inf", function(error, replies) 
					{
						if (replies.toString() !== "") 
						{
							var messages = JSON.parse('['+replies.toString()+']');
							var maxTimeToken = +new Date;
							var messageList = [];

							for (var i=0; i<messages.length; i++)
							{
								if (messages[i].timeToken > maxTimeToken)
								{
									maxTimeToken = messages[i].timeToken;
								}

								messageList.push(JSON.parse(messages[i].message));
							}

							responseString = JSON.stringify({
								messages : messageList,
								timetoken: maxTimeToken
							});

							clearTimeout(redXdrTimeOutReq[uniqueHash]);
							delete redXdrTimeOutReq[uniqueHash];

							// Send it!	
							p.debug("poll response for (via delayed zrange): "+uniqueHash+"\n"+ responseString);			
							res.send('window["'+unique+'"]('+responseString+')', { 'Content-Type': 'application/javascript' }, 200);
						}
					});
				});
		}
	});
});

app.listen(process.argv[3]);

sys.log("pubnub server is now listening on: "+process.argv[2]+ ":" + process.argv[3]);
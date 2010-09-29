require.paths.unshift('./.node_libraries');

var sys = require('sys'),
	express = require('express'),
	redis = require("redis");
    
var redPublisher = redis.createClient();
var redSubscribers = {};

var app = express.createServer();


app.configure(function(){
    app.use(express.methodOverride());
    app.use(express.bodyDecoder());
    //app.use(express.cookieDecoder());
    //app.use(express.session());
    app.use(app.router);
    //app.use(express.staticProvider(__dirname + '/public'));
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	redPublisher.flushdb();
});


// TODO: purge when number of messages > 100 on any channel: ZREMRANGEBYSCORE








app.get('/pubnub-time', function(req, res) 
{
	pubnubResponse = {
		status: 200,
		time: (+new Date)
	}
	
    res.contentType('application/json');
    res.send('window[""](' + JSON.stringify(pubnubResponse) + ')', 200);
});

app.get('/pubnub-uuid', function(req, res) 
{
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
	
	res.contentType('application/json');
    res.send('window[""](' + JSON.stringify(pubnubResponse) + ')', 200);
});

// TODO: "/pubnub-publish?channel=" + this.SUBSCRIBE_KEY +"/" + channel + "&message=" + JSON.stringify(message) +"&publish_key=" + this.PUBLISH_KEY + "&unique=" + unique;
app.get('/pubnub-publish', function(req, res) 
{
	var channel = req.param("channel");
	var message = req.param("message");
	var unique = req.param("unique");
	
	// TODO: Check subscribe key & publish key

	
	// We only need ONE redisClient in async to publish!
	redPublisher.publish(channel, message);

	var pubnubResponse = {
		status: 200
	};

    res.contentType('application/json');
	res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', 200);
});

// TODO: "/pubnub-subscribe?channel=" + this.SUBSCRIBE_KEY +"/" + channel + "&unique=" + unique;
app.get('/pubnub-subscribe', function(req, res) 
{
	//console.log('/pubnub-subscribe');
	
	var channel = req.param("channel");
	var unique = req.param("unique");
		
	if (typeof redSubscribers[channel] === 'undefined')
	{
		redSubscribers[channel] = redis.createClient();
	}

	redSubscribers[channel].on("subscribe", function(channel, count)
	{
		redSubscribers[channel].on("message", function (channel, message) 
		{
			var timeToken = +new Date;
			var messageString = JSON.stringify(
				{
					timeToken: timeToken,
					message: message.toString()
				}
			);
			
			redPublisher.zadd( channel, timeToken.toString(), messageString, 
				function(error, replies)
				{
					redPublisher.publish('#' + channel, messageString, 
						function ()
						{
							//console.log("broadcasting on #"+channel+" message: "+messageString);
						}
					);
				}
			);
			
		});
		
	    res.contentType('application/json');
	    res.send('window["'+unique+'"](' + JSON.stringify({status: 200, server: "127.0.0.1:8080"}) + ')', 200);
	});
	
	
	redSubscribers[channel].subscribe(channel);
});


app.get('/', function(req, res)
{
	var channel = req.param("channel"),
		timeToken = req.param("timetoken") || 0,
		unique = req.param("unique"),
		tempRedisClient = redis.createClient();
	
	// Make sure we send a reply within 30 sec if nothing happens!
	setTimeout( function() 
		{ 
			tempRedisClient.unsubscribe();
			var messageString = JSON.stringify({
				messages : ['xdr.timeout'],
				timetoken: +new Date
			});			
			res.contentType('application/json');
			res.send('window["'+unique+'"]('+messageString+')', 200);
		},
	30000)
	
	redPublisher.zrangebyscore(channel, timeToken+1, "+inf", function(error, replies) 
	{
		if (replies !== null) 
		{
			tempRedisClient.end();
			
			var messages = JSON.parse('['+replies.toString()+']');
			var maxTimeToken = 0;
			var messageList = [];
			
			for (var i=0; i<messages.length; i++)
			{
				if (messages[i].timeToken > maxTimeToken)
				{
					maxTimeToken = messages[i].timeToken;
				}
				
				messageList.push(JSON.parse(messages[i].message));
			}
			
			var messageString = JSON.stringify({
				messages : messageList,
				timetoken: maxTimeToken
			});
			
			res.contentType('application/json');
			//console.log('window["'+unique+'"]('+messageString+')');
			res.send('window["'+unique+'"]('+messageString+')', 200);
		}
		else
		{
			tempRedisClient.on("unsubscribe", 
				function (channel, count) 
				{
					tempRedisClient.end();
				}
			);
			
			
			tempRedisClient.on("subscribe", 
				function(channel, count)
				{
					tempRedisClient.on("message",
						function(channel, replies)
						{
							tempRedisClient.unsubscribe();
							
							var messages = JSON.parse('['+replies.toString()+']');
							var maxTimeToken = 0;
							var messageList = [];
							
							for (var i=0; i<messages.length; i++)
							{
								if (messages[i].timeToken > maxTimeToken)
								{
									maxTimeToken = messages[i].timeToken;
								}
								
								messageList.push(JSON.parse(messages[i].message));
							}
							
							var messageString = JSON.stringify({
								messages : messageList,
								timetoken: maxTimeToken
							});
							
							res.contentType('application/json');
							//console.log('window["'+unique+'"]('+messageString+')');
							res.send('window["'+unique+'"]('+messageString+')', 200);
							
						}
					);
				}
			);
			
			// Now we start listening!
			tempRedisClient.subscribe('#'+channel);
		}
	});
	

});

app.listen(process.argv[2]);

sys.log("nodejs app.js is now running on port " +process.argv[2]);
var profile = {
	basePath: "./",
	layerOptimize: "closure",
	cssOptimize: "comments.keepLines",
	releaseDir: "./release",
	stripConsole: "all",
	mini: true,
	hasReport: true,
	selectorEngine: "lite",
	staticHasFeatures: {
		"dojo-firebug": false,
		"dojo-debug-messages": true,
		'dojo-trace-api': false,
		'dojo-log-api': true,
		"async": true
	},

	packages: [
		{
			name: "dojo",
			location: "./dojo"
		},
		{
			name: "dijit",
			location: "./dijit"
		},
		{
			name: "dojox",
			location: "./dojox"
		}
	],

	layers: { 
		"dojo/p3user": {
			include: [
				"dojo/parser",
				"dijit/form/Form",
				"dijit/form/TextBox",
				"dijit/form/Button",
				"dojox/validate/web",
				"dijit/form/DropDownButton",
				"dijit/_base/manager",
				"dijit/_base",
				"dijit/WidgetSet",
				"dijit/selection",
				"dijit/form/ComboButton",
				"dijit/form/ToggleButton"
			]
		}
	}	
};


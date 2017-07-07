var xml = require('xml');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var md5 = require('md5');
var sanitize = require("sanitize-filename");

module.exports = function(wct, pluginOptions, plugin) {
  console.log('starting wct junit plugin');
  var outputDir = wct.options.plugins['wct-junit'].outputDir;
  var reporters = [];
  var lastReporter;

  wct.on('test-start', function(browser, test, stats) {
    var newReporter = getReporter(reporters, browser, test);
    if (lastReporter && newReporter !== lastReporter) {
      lastReporter.stats.end = new Date();
      lastReporter.stats.duration = new Date() - lastReporter.stats.start;
    }
  });

  wct.on('test-end', function(browser, test, stats) {
    var reporter = getReporter(reporters, browser, test);
    reporter.stats.tests++;
    if (test.state === 'passing') {
      reporter.stats.passes++;
    } else if (test.state === 'failing') {
      reporter.stats.failures++;
    } else if (test.state === 'pending') {
      reporter.stats.pending++;
    }
    reporter.tests.push({
      suite: test.test[1],
      title: test.test[test.test.length - 1],
      state: getState(test.state),
      pending: (test.state === 'pending'),
      duration: test.duration,
      err: test.error
    });
  });

  wct.on('browser-end', function(browser, error, stats) {
    var testSuites = [];
    for (var fileName in reporters[browser.id]) {
      if (reporters[browser.id].hasOwnProperty(fileName)) {
        var reporter = reporters[browser.id][fileName];
        if (!reporter.stats.end) {
            reporter.stats.end = new Date();
            reporter.stats.duration = new Date() - reporter.stats.start;
        }
        var reporterStats = reporter.stats;
        var testSuite = {testsuite:[{
          _attr: {
            name: reporter.tests[0].suite,
            timestamp: new Date().toISOString().slice(0,-5),
            time: reporterStats.duration,
            tests: reporterStats.tests,
            failures: reporterStats.failures,
            skipped: reporterStats.pending
          }
        }]};
        reporter.tests.forEach(function(test) {
          var config = {
            testcase: [{
              _attr: {
                name: test.suite + ' - ' + test.title,
                time: (typeof test.duration === 'undefined') ? 0 : test.duration / 1000,
                classname: test.suite
              }
            }]
          };
          if (test.err) {
            config.testcase.push({failure: {_cdata:test.err.stack}});
          }
          testSuite.testsuite.push(config);
        });
        testSuites.push(testSuite);
      }
    }
    var xmlData = xml({testsuites:testSuites},{declaration:true,indent:'  '});
    var filePath = sanitize('junit-' + browser.browserName + '.xml');
    if (outputDir) {
      filePath = path.join(outputDir, filePath);
    }
    console.log('writing file to', filePath);
    mkdirp.sync(path.dirname(filePath));
    fs.writeFileSync(filePath, xmlData, 'utf-8');
  });
};

function getState(state) {
  if (state === 'passing') {
    return 'passed';
  } else if (state === 'failing') {
    return 'failed';
  } else {
    return null;
  }
}

function getReporter(reporters, browser, test) {
  var browserReporters = reporters[browser.id];
  if (!browserReporters) {
    browserReporters = {};
    reporters[browser.id] = browserReporters;
  }
  var fileName = test.test[0];
  var fileReporter = browserReporters[fileName];
  if (!fileReporter) {
    fileReporter = {};
    fileReporter.tests = [];
    fileReporter.stats = {};
    fileReporter.stats.start = new Date();
    fileReporter.stats.tests = 0;
    fileReporter.stats.passes = 0;
    fileReporter.stats.failures = 0;
    fileReporter.stats.pending = 0;
    browserReporters[fileName] = fileReporter;
  }
  return fileReporter;
}

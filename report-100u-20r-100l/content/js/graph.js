/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 36.0, "minX": 0.0, "maxY": 73827.0, "series": [{"data": [[0.0, 36.0], [0.1, 36.0], [0.2, 36.0], [0.3, 36.0], [0.4, 37.0], [0.5, 37.0], [0.6, 37.0], [0.7, 37.0], [0.8, 37.0], [0.9, 37.0], [1.0, 37.0], [1.1, 37.0], [1.2, 37.0], [1.3, 37.0], [1.4, 37.0], [1.5, 37.0], [1.6, 37.0], [1.7, 37.0], [1.8, 37.0], [1.9, 37.0], [2.0, 37.0], [2.1, 37.0], [2.2, 37.0], [2.3, 37.0], [2.4, 37.0], [2.5, 37.0], [2.6, 37.0], [2.7, 37.0], [2.8, 37.0], [2.9, 37.0], [3.0, 37.0], [3.1, 37.0], [3.2, 37.0], [3.3, 37.0], [3.4, 37.0], [3.5, 37.0], [3.6, 37.0], [3.7, 37.0], [3.8, 37.0], [3.9, 37.0], [4.0, 37.0], [4.1, 37.0], [4.2, 37.0], [4.3, 37.0], [4.4, 37.0], [4.5, 37.0], [4.6, 37.0], [4.7, 37.0], [4.8, 37.0], [4.9, 37.0], [5.0, 37.0], [5.1, 37.0], [5.2, 37.0], [5.3, 37.0], [5.4, 37.0], [5.5, 37.0], [5.6, 37.0], [5.7, 37.0], [5.8, 37.0], [5.9, 37.0], [6.0, 37.0], [6.1, 37.0], [6.2, 37.0], [6.3, 37.0], [6.4, 37.0], [6.5, 37.0], [6.6, 37.0], [6.7, 37.0], [6.8, 37.0], [6.9, 37.0], [7.0, 37.0], [7.1, 37.0], [7.2, 37.0], [7.3, 37.0], [7.4, 37.0], [7.5, 37.0], [7.6, 37.0], [7.7, 37.0], [7.8, 37.0], [7.9, 37.0], [8.0, 37.0], [8.1, 37.0], [8.2, 37.0], [8.3, 37.0], [8.4, 37.0], [8.5, 37.0], [8.6, 37.0], [8.7, 37.0], [8.8, 37.0], [8.9, 37.0], [9.0, 37.0], [9.1, 37.0], [9.2, 37.0], [9.3, 37.0], [9.4, 37.0], [9.5, 37.0], [9.6, 37.0], [9.7, 37.0], [9.8, 37.0], [9.9, 37.0], [10.0, 37.0], [10.1, 37.0], [10.2, 37.0], [10.3, 37.0], [10.4, 37.0], [10.5, 37.0], [10.6, 37.0], [10.7, 38.0], [10.8, 38.0], [10.9, 38.0], [11.0, 38.0], [11.1, 38.0], [11.2, 38.0], [11.3, 38.0], [11.4, 38.0], [11.5, 38.0], [11.6, 38.0], [11.7, 38.0], [11.8, 38.0], [11.9, 38.0], [12.0, 38.0], [12.1, 38.0], [12.2, 38.0], [12.3, 38.0], [12.4, 38.0], [12.5, 38.0], [12.6, 38.0], [12.7, 38.0], [12.8, 38.0], [12.9, 38.0], [13.0, 38.0], [13.1, 38.0], [13.2, 38.0], [13.3, 38.0], [13.4, 38.0], [13.5, 38.0], [13.6, 38.0], [13.7, 38.0], [13.8, 38.0], [13.9, 38.0], [14.0, 38.0], [14.1, 38.0], [14.2, 38.0], [14.3, 38.0], [14.4, 38.0], [14.5, 38.0], [14.6, 38.0], [14.7, 38.0], [14.8, 38.0], [14.9, 38.0], [15.0, 38.0], [15.1, 38.0], [15.2, 38.0], [15.3, 38.0], [15.4, 38.0], [15.5, 38.0], [15.6, 38.0], [15.7, 38.0], [15.8, 38.0], [15.9, 38.0], [16.0, 38.0], [16.1, 38.0], [16.2, 38.0], [16.3, 38.0], [16.4, 38.0], [16.5, 38.0], [16.6, 38.0], [16.7, 38.0], [16.8, 38.0], [16.9, 38.0], [17.0, 38.0], [17.1, 38.0], [17.2, 38.0], [17.3, 38.0], [17.4, 38.0], [17.5, 38.0], [17.6, 38.0], [17.7, 38.0], [17.8, 38.0], [17.9, 38.0], [18.0, 38.0], [18.1, 38.0], [18.2, 38.0], [18.3, 38.0], [18.4, 38.0], [18.5, 38.0], [18.6, 38.0], [18.7, 38.0], [18.8, 38.0], [18.9, 38.0], [19.0, 38.0], [19.1, 38.0], [19.2, 38.0], [19.3, 38.0], [19.4, 38.0], [19.5, 38.0], [19.6, 38.0], [19.7, 38.0], [19.8, 38.0], [19.9, 38.0], [20.0, 38.0], [20.1, 38.0], [20.2, 38.0], [20.3, 38.0], [20.4, 38.0], [20.5, 38.0], [20.6, 38.0], [20.7, 38.0], [20.8, 38.0], [20.9, 38.0], [21.0, 38.0], [21.1, 38.0], [21.2, 38.0], [21.3, 38.0], [21.4, 38.0], [21.5, 38.0], [21.6, 38.0], [21.7, 38.0], [21.8, 38.0], [21.9, 38.0], [22.0, 38.0], [22.1, 38.0], [22.2, 38.0], [22.3, 38.0], [22.4, 38.0], [22.5, 38.0], [22.6, 38.0], [22.7, 38.0], [22.8, 38.0], [22.9, 38.0], [23.0, 38.0], [23.1, 38.0], [23.2, 38.0], [23.3, 38.0], [23.4, 38.0], [23.5, 38.0], [23.6, 38.0], [23.7, 38.0], [23.8, 38.0], [23.9, 38.0], [24.0, 38.0], [24.1, 38.0], [24.2, 38.0], [24.3, 38.0], [24.4, 38.0], [24.5, 38.0], [24.6, 38.0], [24.7, 38.0], [24.8, 38.0], [24.9, 38.0], [25.0, 38.0], [25.1, 38.0], [25.2, 38.0], [25.3, 38.0], [25.4, 38.0], [25.5, 38.0], [25.6, 38.0], [25.7, 38.0], [25.8, 38.0], [25.9, 38.0], [26.0, 38.0], [26.1, 38.0], [26.2, 38.0], [26.3, 38.0], [26.4, 38.0], [26.5, 38.0], [26.6, 38.0], [26.7, 38.0], [26.8, 38.0], [26.9, 38.0], [27.0, 38.0], [27.1, 38.0], [27.2, 38.0], [27.3, 38.0], [27.4, 38.0], [27.5, 38.0], [27.6, 38.0], [27.7, 38.0], [27.8, 38.0], [27.9, 38.0], [28.0, 38.0], [28.1, 38.0], [28.2, 38.0], [28.3, 38.0], [28.4, 38.0], [28.5, 38.0], [28.6, 38.0], [28.7, 38.0], [28.8, 38.0], [28.9, 38.0], [29.0, 38.0], [29.1, 38.0], [29.2, 38.0], [29.3, 38.0], [29.4, 38.0], [29.5, 38.0], [29.6, 38.0], [29.7, 38.0], [29.8, 38.0], [29.9, 38.0], [30.0, 38.0], [30.1, 38.0], [30.2, 38.0], [30.3, 38.0], [30.4, 38.0], [30.5, 38.0], [30.6, 38.0], [30.7, 38.0], [30.8, 38.0], [30.9, 38.0], [31.0, 38.0], [31.1, 38.0], [31.2, 38.0], [31.3, 38.0], [31.4, 38.0], [31.5, 38.0], [31.6, 38.0], [31.7, 38.0], [31.8, 38.0], [31.9, 38.0], [32.0, 38.0], [32.1, 38.0], [32.2, 38.0], [32.3, 38.0], [32.4, 38.0], [32.5, 38.0], [32.6, 38.0], [32.7, 38.0], [32.8, 38.0], [32.9, 38.0], [33.0, 38.0], [33.1, 38.0], [33.2, 38.0], [33.3, 38.0], [33.4, 38.0], [33.5, 38.0], [33.6, 38.0], [33.7, 38.0], [33.8, 38.0], [33.9, 38.0], [34.0, 38.0], [34.1, 38.0], [34.2, 38.0], [34.3, 38.0], [34.4, 38.0], [34.5, 38.0], [34.6, 38.0], [34.7, 38.0], [34.8, 38.0], [34.9, 38.0], [35.0, 38.0], [35.1, 38.0], [35.2, 38.0], [35.3, 38.0], [35.4, 38.0], [35.5, 38.0], [35.6, 38.0], [35.7, 38.0], [35.8, 38.0], [35.9, 38.0], [36.0, 38.0], [36.1, 38.0], [36.2, 38.0], [36.3, 38.0], [36.4, 38.0], [36.5, 38.0], [36.6, 38.0], [36.7, 38.0], [36.8, 39.0], [36.9, 39.0], [37.0, 39.0], [37.1, 39.0], [37.2, 39.0], [37.3, 39.0], [37.4, 39.0], [37.5, 39.0], [37.6, 39.0], [37.7, 39.0], [37.8, 39.0], [37.9, 39.0], [38.0, 39.0], [38.1, 39.0], [38.2, 39.0], [38.3, 39.0], [38.4, 39.0], [38.5, 39.0], [38.6, 39.0], [38.7, 39.0], [38.8, 39.0], [38.9, 39.0], [39.0, 39.0], [39.1, 39.0], [39.2, 39.0], [39.3, 39.0], [39.4, 39.0], [39.5, 39.0], [39.6, 39.0], [39.7, 39.0], [39.8, 39.0], [39.9, 39.0], [40.0, 39.0], [40.1, 39.0], [40.2, 39.0], [40.3, 39.0], [40.4, 39.0], [40.5, 39.0], [40.6, 39.0], [40.7, 39.0], [40.8, 39.0], [40.9, 39.0], [41.0, 39.0], [41.1, 39.0], [41.2, 39.0], [41.3, 39.0], [41.4, 39.0], [41.5, 39.0], [41.6, 39.0], [41.7, 39.0], [41.8, 39.0], [41.9, 39.0], [42.0, 39.0], [42.1, 39.0], [42.2, 39.0], [42.3, 39.0], [42.4, 39.0], [42.5, 39.0], [42.6, 39.0], [42.7, 39.0], [42.8, 39.0], [42.9, 39.0], [43.0, 39.0], [43.1, 39.0], [43.2, 39.0], [43.3, 39.0], [43.4, 39.0], [43.5, 39.0], [43.6, 39.0], [43.7, 39.0], [43.8, 39.0], [43.9, 39.0], [44.0, 39.0], [44.1, 39.0], [44.2, 39.0], [44.3, 39.0], [44.4, 39.0], [44.5, 39.0], [44.6, 39.0], [44.7, 39.0], [44.8, 39.0], [44.9, 39.0], [45.0, 39.0], [45.1, 39.0], [45.2, 39.0], [45.3, 39.0], [45.4, 39.0], [45.5, 39.0], [45.6, 39.0], [45.7, 39.0], [45.8, 39.0], [45.9, 39.0], [46.0, 39.0], [46.1, 39.0], [46.2, 39.0], [46.3, 39.0], [46.4, 39.0], [46.5, 39.0], [46.6, 39.0], [46.7, 39.0], [46.8, 39.0], [46.9, 39.0], [47.0, 39.0], [47.1, 39.0], [47.2, 39.0], [47.3, 39.0], [47.4, 39.0], [47.5, 39.0], [47.6, 39.0], [47.7, 39.0], [47.8, 39.0], [47.9, 39.0], [48.0, 39.0], [48.1, 39.0], [48.2, 39.0], [48.3, 39.0], [48.4, 39.0], [48.5, 39.0], [48.6, 39.0], [48.7, 39.0], [48.8, 39.0], [48.9, 39.0], [49.0, 39.0], [49.1, 39.0], [49.2, 39.0], [49.3, 39.0], [49.4, 39.0], [49.5, 39.0], [49.6, 39.0], [49.7, 39.0], [49.8, 39.0], [49.9, 39.0], [50.0, 39.0], [50.1, 39.0], [50.2, 39.0], [50.3, 39.0], [50.4, 39.0], [50.5, 39.0], [50.6, 39.0], [50.7, 39.0], [50.8, 39.0], [50.9, 39.0], [51.0, 39.0], [51.1, 39.0], [51.2, 39.0], [51.3, 39.0], [51.4, 39.0], [51.5, 39.0], [51.6, 39.0], [51.7, 39.0], [51.8, 39.0], [51.9, 39.0], [52.0, 39.0], [52.1, 39.0], [52.2, 39.0], [52.3, 39.0], [52.4, 39.0], [52.5, 39.0], [52.6, 39.0], [52.7, 39.0], [52.8, 39.0], [52.9, 39.0], [53.0, 39.0], [53.1, 39.0], [53.2, 40.0], [53.3, 40.0], [53.4, 40.0], [53.5, 40.0], [53.6, 40.0], [53.7, 40.0], [53.8, 40.0], [53.9, 40.0], [54.0, 40.0], [54.1, 40.0], [54.2, 40.0], [54.3, 40.0], [54.4, 40.0], [54.5, 40.0], [54.6, 40.0], [54.7, 40.0], [54.8, 40.0], [54.9, 40.0], [55.0, 40.0], [55.1, 40.0], [55.2, 40.0], [55.3, 40.0], [55.4, 40.0], [55.5, 40.0], [55.6, 40.0], [55.7, 40.0], [55.8, 40.0], [55.9, 40.0], [56.0, 40.0], [56.1, 40.0], [56.2, 40.0], [56.3, 40.0], [56.4, 40.0], [56.5, 40.0], [56.6, 40.0], [56.7, 40.0], [56.8, 40.0], [56.9, 40.0], [57.0, 40.0], [57.1, 40.0], [57.2, 40.0], [57.3, 40.0], [57.4, 40.0], [57.5, 40.0], [57.6, 40.0], [57.7, 40.0], [57.8, 40.0], [57.9, 40.0], [58.0, 40.0], [58.1, 40.0], [58.2, 40.0], [58.3, 40.0], [58.4, 40.0], [58.5, 40.0], [58.6, 40.0], [58.7, 40.0], [58.8, 40.0], [58.9, 40.0], [59.0, 40.0], [59.1, 40.0], [59.2, 40.0], [59.3, 40.0], [59.4, 40.0], [59.5, 40.0], [59.6, 40.0], [59.7, 40.0], [59.8, 40.0], [59.9, 40.0], [60.0, 40.0], [60.1, 40.0], [60.2, 40.0], [60.3, 40.0], [60.4, 40.0], [60.5, 40.0], [60.6, 40.0], [60.7, 40.0], [60.8, 40.0], [60.9, 40.0], [61.0, 40.0], [61.1, 40.0], [61.2, 40.0], [61.3, 40.0], [61.4, 40.0], [61.5, 40.0], [61.6, 40.0], [61.7, 40.0], [61.8, 40.0], [61.9, 40.0], [62.0, 40.0], [62.1, 40.0], [62.2, 41.0], [62.3, 41.0], [62.4, 41.0], [62.5, 41.0], [62.6, 41.0], [62.7, 41.0], [62.8, 41.0], [62.9, 41.0], [63.0, 41.0], [63.1, 41.0], [63.2, 41.0], [63.3, 41.0], [63.4, 41.0], [63.5, 41.0], [63.6, 41.0], [63.7, 41.0], [63.8, 41.0], [63.9, 41.0], [64.0, 41.0], [64.1, 41.0], [64.2, 41.0], [64.3, 41.0], [64.4, 41.0], [64.5, 41.0], [64.6, 41.0], [64.7, 41.0], [64.8, 41.0], [64.9, 41.0], [65.0, 41.0], [65.1, 41.0], [65.2, 41.0], [65.3, 41.0], [65.4, 41.0], [65.5, 41.0], [65.6, 41.0], [65.7, 41.0], [65.8, 41.0], [65.9, 41.0], [66.0, 41.0], [66.1, 41.0], [66.2, 41.0], [66.3, 41.0], [66.4, 41.0], [66.5, 41.0], [66.6, 41.0], [66.7, 41.0], [66.8, 41.0], [66.9, 41.0], [67.0, 41.0], [67.1, 41.0], [67.2, 41.0], [67.3, 41.0], [67.4, 41.0], [67.5, 41.0], [67.6, 41.0], [67.7, 41.0], [67.8, 41.0], [67.9, 41.0], [68.0, 41.0], [68.1, 41.0], [68.2, 41.0], [68.3, 41.0], [68.4, 41.0], [68.5, 41.0], [68.6, 41.0], [68.7, 41.0], [68.8, 41.0], [68.9, 41.0], [69.0, 41.0], [69.1, 41.0], [69.2, 41.0], [69.3, 41.0], [69.4, 41.0], [69.5, 42.0], [69.6, 42.0], [69.7, 42.0], [69.8, 42.0], [69.9, 42.0], [70.0, 42.0], [70.1, 42.0], [70.2, 42.0], [70.3, 42.0], [70.4, 42.0], [70.5, 42.0], [70.6, 42.0], [70.7, 42.0], [70.8, 42.0], [70.9, 42.0], [71.0, 42.0], [71.1, 42.0], [71.2, 42.0], [71.3, 42.0], [71.4, 42.0], [71.5, 42.0], [71.6, 42.0], [71.7, 42.0], [71.8, 42.0], [71.9, 42.0], [72.0, 42.0], [72.1, 42.0], [72.2, 42.0], [72.3, 42.0], [72.4, 42.0], [72.5, 42.0], [72.6, 42.0], [72.7, 43.0], [72.8, 43.0], [72.9, 43.0], [73.0, 43.0], [73.1, 43.0], [73.2, 43.0], [73.3, 43.0], [73.4, 43.0], [73.5, 43.0], [73.6, 43.0], [73.7, 43.0], [73.8, 43.0], [73.9, 43.0], [74.0, 43.0], [74.1, 44.0], [74.2, 44.0], [74.3, 44.0], [74.4, 44.0], [74.5, 44.0], [74.6, 44.0], [74.7, 44.0], [74.8, 44.0], [74.9, 45.0], [75.0, 45.0], [75.1, 45.0], [75.2, 45.0], [75.3, 45.0], [75.4, 45.0], [75.5, 45.0], [75.6, 45.0], [75.7, 45.0], [75.8, 46.0], [75.9, 46.0], [76.0, 46.0], [76.1, 46.0], [76.2, 46.0], [76.3, 46.0], [76.4, 47.0], [76.5, 47.0], [76.6, 47.0], [76.7, 48.0], [76.8, 48.0], [76.9, 49.0], [77.0, 49.0], [77.1, 50.0], [77.2, 51.0], [77.3, 53.0], [77.4, 54.0], [77.5, 56.0], [77.6, 58.0], [77.7, 62.0], [77.8, 66.0], [77.9, 69.0], [78.0, 76.0], [78.1, 79.0], [78.2, 86.0], [78.3, 92.0], [78.4, 94.0], [78.5, 102.0], [78.6, 106.0], [78.7, 113.0], [78.8, 114.0], [78.9, 115.0], [79.0, 115.0], [79.1, 117.0], [79.2, 118.0], [79.3, 118.0], [79.4, 119.0], [79.5, 120.0], [79.6, 122.0], [79.7, 123.0], [79.8, 124.0], [79.9, 126.0], [80.0, 128.0], [80.1, 128.0], [80.2, 132.0], [80.3, 137.0], [80.4, 199.0], [80.5, 243.0], [80.6, 253.0], [80.7, 325.0], [80.8, 466.0], [80.9, 553.0], [81.0, 576.0], [81.1, 658.0], [81.2, 813.0], [81.3, 886.0], [81.4, 994.0], [81.5, 1058.0], [81.6, 1127.0], [81.7, 1176.0], [81.8, 1239.0], [81.9, 1279.0], [82.0, 1311.0], [82.1, 1335.0], [82.2, 1362.0], [82.3, 1390.0], [82.4, 1424.0], [82.5, 1462.0], [82.6, 1500.0], [82.7, 1534.0], [82.8, 1558.0], [82.9, 1572.0], [83.0, 1629.0], [83.1, 1659.0], [83.2, 1686.0], [83.3, 1730.0], [83.4, 1764.0], [83.5, 1809.0], [83.6, 1832.0], [83.7, 1897.0], [83.8, 1944.0], [83.9, 2003.0], [84.0, 2055.0], [84.1, 2090.0], [84.2, 2250.0], [84.3, 2343.0], [84.4, 2484.0], [84.5, 2667.0], [84.6, 2719.0], [84.7, 2889.0], [84.8, 3112.0], [84.9, 3459.0], [85.0, 3766.0], [85.1, 4029.0], [85.2, 4429.0], [85.3, 4643.0], [85.4, 4865.0], [85.5, 5191.0], [85.6, 5610.0], [85.7, 5860.0], [85.8, 6145.0], [85.9, 6364.0], [86.0, 6498.0], [86.1, 6595.0], [86.2, 6755.0], [86.3, 6873.0], [86.4, 7002.0], [86.5, 7126.0], [86.6, 7215.0], [86.7, 7311.0], [86.8, 7350.0], [86.9, 7438.0], [87.0, 7481.0], [87.1, 7527.0], [87.2, 7580.0], [87.3, 7635.0], [87.4, 7704.0], [87.5, 7761.0], [87.6, 7836.0], [87.7, 7879.0], [87.8, 7932.0], [87.9, 7957.0], [88.0, 8018.0], [88.1, 8057.0], [88.2, 8082.0], [88.3, 8116.0], [88.4, 8147.0], [88.5, 8199.0], [88.6, 8235.0], [88.7, 8272.0], [88.8, 8337.0], [88.9, 8368.0], [89.0, 8397.0], [89.1, 8425.0], [89.2, 8477.0], [89.3, 8493.0], [89.4, 8547.0], [89.5, 8593.0], [89.6, 8640.0], [89.7, 8675.0], [89.8, 8727.0], [89.9, 8773.0], [90.0, 8826.0], [90.1, 8867.0], [90.2, 8924.0], [90.3, 8970.0], [90.4, 9052.0], [90.5, 9102.0], [90.6, 9167.0], [90.7, 9226.0], [90.8, 9286.0], [90.9, 9325.0], [91.0, 9371.0], [91.1, 9429.0], [91.2, 9476.0], [91.3, 9552.0], [91.4, 9592.0], [91.5, 9639.0], [91.6, 9695.0], [91.7, 9771.0], [91.8, 9839.0], [91.9, 9900.0], [92.0, 9973.0], [92.1, 10054.0], [92.2, 10203.0], [92.3, 10343.0], [92.4, 10397.0], [92.5, 10560.0], [92.6, 10688.0], [92.7, 10813.0], [92.8, 10885.0], [92.9, 10991.0], [93.0, 11139.0], [93.1, 11422.0], [93.2, 11719.0], [93.3, 12053.0], [93.4, 12260.0], [93.5, 12454.0], [93.6, 12705.0], [93.7, 12820.0], [93.8, 13007.0], [93.9, 13132.0], [94.0, 13244.0], [94.1, 13436.0], [94.2, 13632.0], [94.3, 13741.0], [94.4, 13819.0], [94.5, 13913.0], [94.6, 14065.0], [94.7, 14182.0], [94.8, 14278.0], [94.9, 14368.0], [95.0, 14504.0], [95.1, 14547.0], [95.2, 14596.0], [95.3, 14690.0], [95.4, 14769.0], [95.5, 14848.0], [95.6, 14987.0], [95.7, 15038.0], [95.8, 15111.0], [95.9, 15171.0], [96.0, 15248.0], [96.1, 15318.0], [96.2, 15401.0], [96.3, 15506.0], [96.4, 15614.0], [96.5, 15666.0], [96.6, 15736.0], [96.7, 15822.0], [96.8, 15871.0], [96.9, 15942.0], [97.0, 16032.0], [97.1, 16134.0], [97.2, 16191.0], [97.3, 16251.0], [97.4, 16335.0], [97.5, 16409.0], [97.6, 16502.0], [97.7, 16549.0], [97.8, 16600.0], [97.9, 16695.0], [98.0, 16757.0], [98.1, 16824.0], [98.2, 16887.0], [98.3, 16980.0], [98.4, 17054.0], [98.5, 17203.0], [98.6, 17256.0], [98.7, 17407.0], [98.8, 17513.0], [98.9, 17636.0], [99.0, 17743.0], [99.1, 17898.0], [99.2, 18002.0], [99.3, 18127.0], [99.4, 18286.0], [99.5, 18456.0], [99.6, 18907.0], [99.7, 19457.0], [99.8, 19820.0], [99.9, 20814.0], [100.0, 73827.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 7845.0, "series": [{"data": [[0.0, 7845.0], [100.0, 195.0], [200.0, 27.0], [73800.0, 1.0], [300.0, 9.0], [400.0, 6.0], [500.0, 22.0], [600.0, 6.0], [700.0, 6.0], [800.0, 15.0], [900.0, 9.0], [1000.0, 17.0], [1100.0, 18.0], [1200.0, 22.0], [1300.0, 35.0], [1400.0, 26.0], [1500.0, 37.0], [1600.0, 27.0], [1700.0, 26.0], [1800.0, 24.0], [1900.0, 17.0], [2000.0, 21.0], [2100.0, 4.0], [2200.0, 11.0], [2300.0, 8.0], [2400.0, 8.0], [2500.0, 2.0], [2600.0, 11.0], [2700.0, 10.0], [2800.0, 7.0], [2900.0, 2.0], [3000.0, 4.0], [3100.0, 4.0], [3200.0, 4.0], [3300.0, 3.0], [3400.0, 4.0], [3500.0, 2.0], [3700.0, 5.0], [3600.0, 3.0], [3800.0, 4.0], [3900.0, 3.0], [4000.0, 1.0], [4100.0, 2.0], [4200.0, 2.0], [4300.0, 4.0], [4400.0, 6.0], [4600.0, 5.0], [4500.0, 4.0], [4800.0, 5.0], [4700.0, 4.0], [4900.0, 4.0], [5100.0, 4.0], [5000.0, 1.0], [5300.0, 3.0], [5200.0, 1.0], [5600.0, 4.0], [5400.0, 1.0], [5500.0, 3.0], [5800.0, 3.0], [5700.0, 4.0], [6100.0, 4.0], [5900.0, 3.0], [6000.0, 4.0], [6300.0, 5.0], [6200.0, 4.0], [6400.0, 10.0], [6500.0, 10.0], [6600.0, 7.0], [6900.0, 7.0], [6700.0, 8.0], [6800.0, 7.0], [7000.0, 9.0], [7100.0, 10.0], [7200.0, 10.0], [7400.0, 19.0], [7300.0, 16.0], [7600.0, 15.0], [7500.0, 20.0], [7800.0, 18.0], [7700.0, 16.0], [7900.0, 26.0], [8000.0, 26.0], [8100.0, 26.0], [8200.0, 26.0], [8400.0, 30.0], [8300.0, 25.0], [8600.0, 22.0], [8700.0, 19.0], [8500.0, 21.0], [9200.0, 21.0], [9100.0, 13.0], [8800.0, 24.0], [9000.0, 16.0], [8900.0, 16.0], [9600.0, 18.0], [9300.0, 20.0], [9400.0, 22.0], [9500.0, 17.0], [9700.0, 15.0], [10100.0, 8.0], [9900.0, 12.0], [10000.0, 10.0], [10200.0, 8.0], [9800.0, 14.0], [10600.0, 6.0], [10700.0, 7.0], [10400.0, 7.0], [10300.0, 13.0], [10500.0, 7.0], [10800.0, 14.0], [10900.0, 9.0], [11100.0, 5.0], [11000.0, 7.0], [11200.0, 4.0], [11400.0, 5.0], [11700.0, 5.0], [11300.0, 2.0], [11500.0, 3.0], [11600.0, 1.0], [12200.0, 8.0], [11900.0, 5.0], [11800.0, 2.0], [12100.0, 2.0], [12000.0, 1.0], [12700.0, 8.0], [12600.0, 3.0], [12300.0, 7.0], [12400.0, 4.0], [12500.0, 4.0], [12800.0, 7.0], [13100.0, 11.0], [13000.0, 9.0], [13200.0, 5.0], [12900.0, 4.0], [13300.0, 6.0], [13800.0, 14.0], [13600.0, 6.0], [13700.0, 9.0], [13400.0, 6.0], [13500.0, 5.0], [14200.0, 10.0], [14100.0, 8.0], [14300.0, 9.0], [13900.0, 8.0], [14000.0, 8.0], [14700.0, 16.0], [14500.0, 21.0], [14400.0, 8.0], [14800.0, 6.0], [14600.0, 10.0], [14900.0, 12.0], [15100.0, 17.0], [15300.0, 11.0], [15000.0, 13.0], [15200.0, 14.0], [15400.0, 9.0], [15500.0, 10.0], [15600.0, 14.0], [15700.0, 16.0], [15800.0, 17.0], [15900.0, 13.0], [16300.0, 12.0], [16100.0, 20.0], [16200.0, 11.0], [16000.0, 6.0], [16600.0, 14.0], [17400.0, 12.0], [17200.0, 14.0], [16800.0, 16.0], [16400.0, 11.0], [17000.0, 8.0], [17600.0, 7.0], [18400.0, 4.0], [18200.0, 6.0], [18000.0, 7.0], [17800.0, 6.0], [18800.0, 1.0], [19000.0, 4.0], [19200.0, 1.0], [19400.0, 1.0], [19800.0, 2.0], [19600.0, 3.0], [20600.0, 3.0], [20800.0, 2.0], [21600.0, 1.0], [22200.0, 1.0], [21800.0, 1.0], [17100.0, 7.0], [16900.0, 14.0], [17300.0, 4.0], [16500.0, 21.0], [16700.0, 11.0], [18300.0, 5.0], [17900.0, 7.0], [18100.0, 11.0], [17700.0, 10.0], [17500.0, 9.0], [18900.0, 3.0], [18500.0, 6.0], [18700.0, 1.0], [19100.0, 2.0], [19500.0, 5.0], [20100.0, 2.0], [19700.0, 1.0], [20300.0, 2.0], [21500.0, 2.0], [20700.0, 1.0], [20900.0, 1.0], [22300.0, 1.0], [22700.0, 1.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 73800.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 98.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 8521.0, "series": [{"data": [[1.0, 98.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 8521.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 1381.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 94.951768488746, "minX": 1.5250893E12, "maxY": 100.0, "series": [{"data": [[1.5250893E12, 94.951768488746], [1.52508948E12, 97.14985354422942], [1.52508936E12, 100.0], [1.52508942E12, 100.0]], "isOverall": false, "label": "Digisoria Customer 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52508948E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 36.75, "minX": 1.0, "maxY": 3115.0, "series": [{"data": [[2.0, 37.0], [3.0, 37.0], [4.0, 38.5], [5.0, 37.0], [6.0, 41.0], [7.0, 37.0], [8.0, 37.0], [9.0, 38.0], [10.0, 36.75], [12.0, 37.25], [13.0, 38.0], [14.0, 39.0], [15.0, 37.2], [17.0, 37.0], [19.0, 38.8], [20.0, 40.0], [21.0, 43.0], [22.0, 41.5], [23.0, 41.0], [24.0, 41.0], [25.0, 1134.0], [26.0, 1045.0], [27.0, 341.5], [28.0, 38.0], [29.0, 645.8888888888889], [30.0, 356.33333333333337], [31.0, 38.0], [33.0, 269.0], [32.0, 39.0], [35.0, 38.0], [34.0, 38.92307692307692], [37.0, 156.25], [36.0, 37.0], [39.0, 37.25], [38.0, 38.666666666666664], [40.0, 460.0], [41.0, 778.0], [43.0, 37.0], [42.0, 38.09090909090909], [44.0, 1626.5], [45.0, 52.0], [47.0, 38.333333333333336], [46.0, 39.0], [49.0, 1642.3333333333335], [51.0, 355.09090909090907], [50.0, 37.33333333333333], [53.0, 40.666666666666664], [52.0, 40.0], [54.0, 776.6], [55.0, 493.1111111111111], [56.0, 574.4444444444445], [57.0, 1607.0], [59.0, 37.6], [58.0, 38.61538461538462], [61.0, 41.0], [60.0, 40.0], [62.0, 300.4], [63.0, 1302.375], [64.0, 721.25], [66.0, 230.95999999999998], [67.0, 44.5], [65.0, 49.5], [68.0, 428.2], [70.0, 167.09090909090912], [71.0, 40.06250000000001], [69.0, 37.666666666666664], [72.0, 266.57142857142856], [73.0, 461.4], [75.0, 39.0], [74.0, 38.87500000000001], [78.0, 2306.5], [79.0, 37.6], [77.0, 43.125], [76.0, 41.375], [80.0, 3115.0], [81.0, 291.6428571428572], [83.0, 38.125], [82.0, 38.74999999999999], [84.0, 1158.2], [87.0, 39.49999999999999], [86.0, 38.04651162790699], [85.0, 38.0], [91.0, 37.6], [90.0, 38.285714285714285], [89.0, 38.19512195121951], [88.0, 38.87234042553191], [95.0, 38.70370370370371], [94.0, 38.93989071038254], [93.0, 39.05263157894737], [92.0, 40.53658536585366], [96.0, 372.18181818181824], [99.0, 38.93286219081273], [98.0, 40.400000000000006], [97.0, 39.94117647058823], [100.0, 2137.2331947331954], [1.0, 40.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}, {"data": [[97.41039999999994, 1867.5072999999968]], "isOverall": false, "label": "Digisoria Shopfront 132-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 7249.7, "minX": 1.5250893E12, "maxY": 118761.26666666666, "series": [{"data": [[1.5250893E12, 67850.08333333333], [1.52508948E12, 89497.05], [1.52508936E12, 118761.26666666666], [1.52508942E12, 114738.88333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5250893E12, 7249.7], [1.52508948E12, 27848.6], [1.52508936E12, 15062.233333333334], [1.52508942E12, 14675.366666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52508948E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 443.2883421206784, "minX": 1.5250893E12, "maxY": 10290.115120274913, "series": [{"data": [[1.5250893E12, 9770.260450160773], [1.52508948E12, 443.2883421206784], [1.52508936E12, 10290.115120274913], [1.52508942E12, 10252.113636363641]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52508948E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 59.463151728178396, "minX": 1.5250893E12, "maxY": 199.86173633440512, "series": [{"data": [[1.5250893E12, 199.86173633440512], [1.52508948E12, 59.463151728178396], [1.52508936E12, 114.3865979381443], [1.52508942E12, 119.17132867132865]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52508948E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 6.762741652021053, "minX": 1.5250893E12, "maxY": 113.7942122186495, "series": [{"data": [[1.5250893E12, 113.7942122186495], [1.52508948E12, 6.762741652021053], [1.52508936E12, 67.6323024054983], [1.52508942E12, 69.95454545454548]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52508948E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 725.0, "minX": 1.5250893E12, "maxY": 22748.0, "series": [{"data": [[1.5250893E12, 22379.0], [1.52508948E12, 20991.0], [1.52508936E12, 22748.0], [1.52508942E12, 21848.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5250893E12, 725.0], [1.52508948E12, 850.0], [1.52508936E12, 795.0], [1.52508942E12, 838.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5250893E12, 17259.2], [1.52508948E12, 17206.0], [1.52508936E12, 17414.5], [1.52508942E12, 17206.2]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5250893E12, 20626.48], [1.52508948E12, 20383.600000000013], [1.52508936E12, 20431.5], [1.52508942E12, 20321.5]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5250893E12, 18260.800000000003], [1.52508948E12, 18075.0], [1.52508936E12, 18110.0], [1.52508942E12, 18055.3]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52508948E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 39.0, "minX": 5.0, "maxY": 10365.0, "series": [{"data": [[142.0, 10365.0], [9.0, 9679.0], [5.0, 9485.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[142.0, 39.0], [9.0, 4741.0], [5.0, 8677.5]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 142.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 39.0, "minX": 5.0, "maxY": 117.0, "series": [{"data": [[142.0, 114.0], [9.0, 115.0], [5.0, 117.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[142.0, 39.0], [9.0, 115.0], [5.0, 115.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 142.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 6.85, "minX": 1.5250893E12, "maxY": 140.58333333333334, "series": [{"data": [[1.5250893E12, 6.85], [1.52508948E12, 140.58333333333334], [1.52508936E12, 9.7], [1.52508942E12, 9.533333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52508948E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.5250893E12, "maxY": 135.06666666666666, "series": [{"data": [[1.5250893E12, 5.05], [1.52508948E12, 2.7], [1.52508936E12, 8.683333333333334], [1.52508942E12, 8.216666666666667]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5250893E12, 0.13333333333333333], [1.52508948E12, 3.433333333333333], [1.52508936E12, 0.9833333333333333], [1.52508942E12, 1.0833333333333333]], "isOverall": false, "label": "500", "isController": false}, {"data": [[1.52508948E12, 0.9833333333333333], [1.52508936E12, 0.03333333333333333], [1.52508942E12, 0.21666666666666667]], "isOverall": false, "label": "403", "isController": false}, {"data": [[1.52508948E12, 135.06666666666666]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.52508948E12, 0.06666666666666667], [1.52508942E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.ConnectionClosedException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52508948E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.13333333333333333, "minX": 1.5250893E12, "maxY": 139.55, "series": [{"data": [[1.5250893E12, 5.05], [1.52508948E12, 2.7], [1.52508936E12, 8.683333333333334], [1.52508942E12, 8.216666666666667]], "isOverall": false, "label": "Digisoria Shopfront 132-success", "isController": false}, {"data": [[1.5250893E12, 0.13333333333333333], [1.52508948E12, 139.55], [1.52508936E12, 1.0166666666666666], [1.52508942E12, 1.3166666666666667]], "isOverall": false, "label": "Digisoria Shopfront 132-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52508948E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}

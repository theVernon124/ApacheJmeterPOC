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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 276749.0, "series": [{"data": [[0.0, 2.0], [0.1, 3.0], [0.2, 3.0], [0.3, 3.0], [0.4, 3.0], [0.5, 3.0], [0.6, 3.0], [0.7, 3.0], [0.8, 3.0], [0.9, 3.0], [1.0, 3.0], [1.1, 3.0], [1.2, 3.0], [1.3, 3.0], [1.4, 3.0], [1.5, 3.0], [1.6, 3.0], [1.7, 3.0], [1.8, 3.0], [1.9, 3.0], [2.0, 3.0], [2.1, 3.0], [2.2, 3.0], [2.3, 3.0], [2.4, 3.0], [2.5, 3.0], [2.6, 3.0], [2.7, 3.0], [2.8, 3.0], [2.9, 3.0], [3.0, 3.0], [3.1, 3.0], [3.2, 4.0], [3.3, 4.0], [3.4, 4.0], [3.5, 4.0], [3.6, 4.0], [3.7, 4.0], [3.8, 4.0], [3.9, 4.0], [4.0, 4.0], [4.1, 4.0], [4.2, 4.0], [4.3, 4.0], [4.4, 4.0], [4.5, 4.0], [4.6, 4.0], [4.7, 4.0], [4.8, 4.0], [4.9, 4.0], [5.0, 4.0], [5.1, 4.0], [5.2, 4.0], [5.3, 4.0], [5.4, 4.0], [5.5, 4.0], [5.6, 4.0], [5.7, 4.0], [5.8, 4.0], [5.9, 4.0], [6.0, 4.0], [6.1, 4.0], [6.2, 4.0], [6.3, 4.0], [6.4, 4.0], [6.5, 4.0], [6.6, 4.0], [6.7, 4.0], [6.8, 4.0], [6.9, 4.0], [7.0, 4.0], [7.1, 4.0], [7.2, 4.0], [7.3, 4.0], [7.4, 4.0], [7.5, 4.0], [7.6, 4.0], [7.7, 4.0], [7.8, 4.0], [7.9, 4.0], [8.0, 4.0], [8.1, 4.0], [8.2, 4.0], [8.3, 4.0], [8.4, 4.0], [8.5, 4.0], [8.6, 4.0], [8.7, 4.0], [8.8, 4.0], [8.9, 4.0], [9.0, 4.0], [9.1, 4.0], [9.2, 4.0], [9.3, 4.0], [9.4, 4.0], [9.5, 4.0], [9.6, 4.0], [9.7, 4.0], [9.8, 4.0], [9.9, 4.0], [10.0, 4.0], [10.1, 4.0], [10.2, 4.0], [10.3, 4.0], [10.4, 4.0], [10.5, 4.0], [10.6, 4.0], [10.7, 4.0], [10.8, 4.0], [10.9, 4.0], [11.0, 4.0], [11.1, 4.0], [11.2, 4.0], [11.3, 4.0], [11.4, 4.0], [11.5, 4.0], [11.6, 4.0], [11.7, 4.0], [11.8, 4.0], [11.9, 4.0], [12.0, 4.0], [12.1, 4.0], [12.2, 4.0], [12.3, 4.0], [12.4, 4.0], [12.5, 4.0], [12.6, 4.0], [12.7, 4.0], [12.8, 4.0], [12.9, 4.0], [13.0, 4.0], [13.1, 4.0], [13.2, 4.0], [13.3, 4.0], [13.4, 4.0], [13.5, 4.0], [13.6, 4.0], [13.7, 4.0], [13.8, 4.0], [13.9, 4.0], [14.0, 4.0], [14.1, 4.0], [14.2, 4.0], [14.3, 4.0], [14.4, 4.0], [14.5, 4.0], [14.6, 4.0], [14.7, 4.0], [14.8, 4.0], [14.9, 4.0], [15.0, 4.0], [15.1, 4.0], [15.2, 4.0], [15.3, 4.0], [15.4, 4.0], [15.5, 4.0], [15.6, 4.0], [15.7, 4.0], [15.8, 4.0], [15.9, 4.0], [16.0, 4.0], [16.1, 4.0], [16.2, 4.0], [16.3, 4.0], [16.4, 4.0], [16.5, 4.0], [16.6, 4.0], [16.7, 4.0], [16.8, 4.0], [16.9, 4.0], [17.0, 4.0], [17.1, 4.0], [17.2, 4.0], [17.3, 4.0], [17.4, 4.0], [17.5, 4.0], [17.6, 4.0], [17.7, 4.0], [17.8, 4.0], [17.9, 4.0], [18.0, 4.0], [18.1, 4.0], [18.2, 4.0], [18.3, 4.0], [18.4, 4.0], [18.5, 4.0], [18.6, 4.0], [18.7, 4.0], [18.8, 4.0], [18.9, 4.0], [19.0, 4.0], [19.1, 4.0], [19.2, 4.0], [19.3, 4.0], [19.4, 4.0], [19.5, 4.0], [19.6, 4.0], [19.7, 4.0], [19.8, 4.0], [19.9, 4.0], [20.0, 4.0], [20.1, 4.0], [20.2, 4.0], [20.3, 4.0], [20.4, 4.0], [20.5, 4.0], [20.6, 4.0], [20.7, 4.0], [20.8, 4.0], [20.9, 4.0], [21.0, 4.0], [21.1, 4.0], [21.2, 4.0], [21.3, 4.0], [21.4, 4.0], [21.5, 4.0], [21.6, 4.0], [21.7, 4.0], [21.8, 4.0], [21.9, 4.0], [22.0, 4.0], [22.1, 4.0], [22.2, 4.0], [22.3, 4.0], [22.4, 4.0], [22.5, 4.0], [22.6, 4.0], [22.7, 4.0], [22.8, 4.0], [22.9, 4.0], [23.0, 4.0], [23.1, 4.0], [23.2, 4.0], [23.3, 4.0], [23.4, 4.0], [23.5, 4.0], [23.6, 4.0], [23.7, 4.0], [23.8, 4.0], [23.9, 4.0], [24.0, 4.0], [24.1, 4.0], [24.2, 4.0], [24.3, 4.0], [24.4, 4.0], [24.5, 4.0], [24.6, 4.0], [24.7, 4.0], [24.8, 4.0], [24.9, 4.0], [25.0, 4.0], [25.1, 4.0], [25.2, 4.0], [25.3, 4.0], [25.4, 4.0], [25.5, 4.0], [25.6, 4.0], [25.7, 4.0], [25.8, 4.0], [25.9, 4.0], [26.0, 4.0], [26.1, 4.0], [26.2, 4.0], [26.3, 4.0], [26.4, 4.0], [26.5, 4.0], [26.6, 4.0], [26.7, 4.0], [26.8, 4.0], [26.9, 4.0], [27.0, 4.0], [27.1, 4.0], [27.2, 4.0], [27.3, 4.0], [27.4, 4.0], [27.5, 4.0], [27.6, 4.0], [27.7, 4.0], [27.8, 4.0], [27.9, 4.0], [28.0, 4.0], [28.1, 4.0], [28.2, 4.0], [28.3, 4.0], [28.4, 4.0], [28.5, 4.0], [28.6, 4.0], [28.7, 4.0], [28.8, 4.0], [28.9, 4.0], [29.0, 4.0], [29.1, 4.0], [29.2, 4.0], [29.3, 4.0], [29.4, 4.0], [29.5, 4.0], [29.6, 4.0], [29.7, 4.0], [29.8, 4.0], [29.9, 4.0], [30.0, 4.0], [30.1, 4.0], [30.2, 4.0], [30.3, 4.0], [30.4, 4.0], [30.5, 4.0], [30.6, 4.0], [30.7, 4.0], [30.8, 4.0], [30.9, 4.0], [31.0, 4.0], [31.1, 4.0], [31.2, 4.0], [31.3, 4.0], [31.4, 4.0], [31.5, 4.0], [31.6, 5.0], [31.7, 5.0], [31.8, 5.0], [31.9, 5.0], [32.0, 5.0], [32.1, 5.0], [32.2, 5.0], [32.3, 5.0], [32.4, 5.0], [32.5, 5.0], [32.6, 5.0], [32.7, 5.0], [32.8, 5.0], [32.9, 5.0], [33.0, 5.0], [33.1, 5.0], [33.2, 5.0], [33.3, 5.0], [33.4, 5.0], [33.5, 5.0], [33.6, 5.0], [33.7, 5.0], [33.8, 5.0], [33.9, 5.0], [34.0, 5.0], [34.1, 5.0], [34.2, 5.0], [34.3, 5.0], [34.4, 5.0], [34.5, 5.0], [34.6, 5.0], [34.7, 5.0], [34.8, 5.0], [34.9, 5.0], [35.0, 5.0], [35.1, 5.0], [35.2, 5.0], [35.3, 5.0], [35.4, 5.0], [35.5, 5.0], [35.6, 5.0], [35.7, 5.0], [35.8, 5.0], [35.9, 5.0], [36.0, 5.0], [36.1, 5.0], [36.2, 5.0], [36.3, 5.0], [36.4, 5.0], [36.5, 5.0], [36.6, 5.0], [36.7, 5.0], [36.8, 5.0], [36.9, 5.0], [37.0, 5.0], [37.1, 5.0], [37.2, 5.0], [37.3, 5.0], [37.4, 5.0], [37.5, 5.0], [37.6, 5.0], [37.7, 5.0], [37.8, 5.0], [37.9, 5.0], [38.0, 5.0], [38.1, 5.0], [38.2, 5.0], [38.3, 5.0], [38.4, 5.0], [38.5, 5.0], [38.6, 5.0], [38.7, 5.0], [38.8, 5.0], [38.9, 5.0], [39.0, 5.0], [39.1, 5.0], [39.2, 5.0], [39.3, 5.0], [39.4, 5.0], [39.5, 5.0], [39.6, 5.0], [39.7, 5.0], [39.8, 5.0], [39.9, 5.0], [40.0, 5.0], [40.1, 5.0], [40.2, 5.0], [40.3, 5.0], [40.4, 5.0], [40.5, 5.0], [40.6, 5.0], [40.7, 5.0], [40.8, 5.0], [40.9, 5.0], [41.0, 5.0], [41.1, 5.0], [41.2, 5.0], [41.3, 5.0], [41.4, 5.0], [41.5, 5.0], [41.6, 5.0], [41.7, 5.0], [41.8, 5.0], [41.9, 5.0], [42.0, 5.0], [42.1, 5.0], [42.2, 5.0], [42.3, 5.0], [42.4, 5.0], [42.5, 5.0], [42.6, 5.0], [42.7, 5.0], [42.8, 5.0], [42.9, 5.0], [43.0, 5.0], [43.1, 5.0], [43.2, 5.0], [43.3, 5.0], [43.4, 5.0], [43.5, 5.0], [43.6, 5.0], [43.7, 5.0], [43.8, 5.0], [43.9, 5.0], [44.0, 5.0], [44.1, 5.0], [44.2, 5.0], [44.3, 5.0], [44.4, 5.0], [44.5, 5.0], [44.6, 5.0], [44.7, 5.0], [44.8, 5.0], [44.9, 5.0], [45.0, 5.0], [45.1, 5.0], [45.2, 5.0], [45.3, 5.0], [45.4, 5.0], [45.5, 5.0], [45.6, 5.0], [45.7, 5.0], [45.8, 5.0], [45.9, 5.0], [46.0, 5.0], [46.1, 5.0], [46.2, 5.0], [46.3, 5.0], [46.4, 5.0], [46.5, 5.0], [46.6, 5.0], [46.7, 5.0], [46.8, 5.0], [46.9, 5.0], [47.0, 5.0], [47.1, 5.0], [47.2, 5.0], [47.3, 5.0], [47.4, 5.0], [47.5, 5.0], [47.6, 5.0], [47.7, 5.0], [47.8, 5.0], [47.9, 5.0], [48.0, 5.0], [48.1, 5.0], [48.2, 5.0], [48.3, 5.0], [48.4, 5.0], [48.5, 5.0], [48.6, 5.0], [48.7, 5.0], [48.8, 5.0], [48.9, 5.0], [49.0, 5.0], [49.1, 5.0], [49.2, 5.0], [49.3, 5.0], [49.4, 5.0], [49.5, 5.0], [49.6, 5.0], [49.7, 5.0], [49.8, 5.0], [49.9, 5.0], [50.0, 5.0], [50.1, 5.0], [50.2, 5.0], [50.3, 5.0], [50.4, 5.0], [50.5, 5.0], [50.6, 5.0], [50.7, 5.0], [50.8, 5.0], [50.9, 5.0], [51.0, 5.0], [51.1, 5.0], [51.2, 5.0], [51.3, 5.0], [51.4, 5.0], [51.5, 5.0], [51.6, 5.0], [51.7, 5.0], [51.8, 5.0], [51.9, 5.0], [52.0, 5.0], [52.1, 5.0], [52.2, 5.0], [52.3, 5.0], [52.4, 5.0], [52.5, 5.0], [52.6, 5.0], [52.7, 5.0], [52.8, 5.0], [52.9, 5.0], [53.0, 5.0], [53.1, 5.0], [53.2, 5.0], [53.3, 5.0], [53.4, 5.0], [53.5, 5.0], [53.6, 5.0], [53.7, 5.0], [53.8, 5.0], [53.9, 5.0], [54.0, 5.0], [54.1, 5.0], [54.2, 5.0], [54.3, 5.0], [54.4, 5.0], [54.5, 5.0], [54.6, 5.0], [54.7, 5.0], [54.8, 5.0], [54.9, 5.0], [55.0, 5.0], [55.1, 5.0], [55.2, 5.0], [55.3, 5.0], [55.4, 5.0], [55.5, 5.0], [55.6, 5.0], [55.7, 5.0], [55.8, 5.0], [55.9, 5.0], [56.0, 5.0], [56.1, 5.0], [56.2, 5.0], [56.3, 5.0], [56.4, 5.0], [56.5, 5.0], [56.6, 5.0], [56.7, 5.0], [56.8, 5.0], [56.9, 5.0], [57.0, 5.0], [57.1, 5.0], [57.2, 5.0], [57.3, 5.0], [57.4, 5.0], [57.5, 5.0], [57.6, 5.0], [57.7, 5.0], [57.8, 5.0], [57.9, 5.0], [58.0, 5.0], [58.1, 5.0], [58.2, 5.0], [58.3, 5.0], [58.4, 5.0], [58.5, 5.0], [58.6, 5.0], [58.7, 5.0], [58.8, 5.0], [58.9, 5.0], [59.0, 5.0], [59.1, 5.0], [59.2, 5.0], [59.3, 5.0], [59.4, 5.0], [59.5, 5.0], [59.6, 5.0], [59.7, 5.0], [59.8, 5.0], [59.9, 5.0], [60.0, 5.0], [60.1, 5.0], [60.2, 5.0], [60.3, 5.0], [60.4, 5.0], [60.5, 5.0], [60.6, 5.0], [60.7, 5.0], [60.8, 5.0], [60.9, 5.0], [61.0, 5.0], [61.1, 5.0], [61.2, 5.0], [61.3, 5.0], [61.4, 5.0], [61.5, 5.0], [61.6, 5.0], [61.7, 5.0], [61.8, 5.0], [61.9, 5.0], [62.0, 5.0], [62.1, 5.0], [62.2, 5.0], [62.3, 5.0], [62.4, 6.0], [62.5, 6.0], [62.6, 6.0], [62.7, 6.0], [62.8, 6.0], [62.9, 6.0], [63.0, 6.0], [63.1, 6.0], [63.2, 6.0], [63.3, 6.0], [63.4, 6.0], [63.5, 6.0], [63.6, 6.0], [63.7, 6.0], [63.8, 6.0], [63.9, 6.0], [64.0, 6.0], [64.1, 6.0], [64.2, 6.0], [64.3, 6.0], [64.4, 6.0], [64.5, 6.0], [64.6, 6.0], [64.7, 6.0], [64.8, 6.0], [64.9, 6.0], [65.0, 6.0], [65.1, 6.0], [65.2, 6.0], [65.3, 6.0], [65.4, 6.0], [65.5, 6.0], [65.6, 6.0], [65.7, 6.0], [65.8, 6.0], [65.9, 6.0], [66.0, 6.0], [66.1, 6.0], [66.2, 6.0], [66.3, 6.0], [66.4, 6.0], [66.5, 6.0], [66.6, 6.0], [66.7, 6.0], [66.8, 6.0], [66.9, 6.0], [67.0, 6.0], [67.1, 6.0], [67.2, 6.0], [67.3, 6.0], [67.4, 6.0], [67.5, 6.0], [67.6, 6.0], [67.7, 6.0], [67.8, 6.0], [67.9, 6.0], [68.0, 6.0], [68.1, 6.0], [68.2, 6.0], [68.3, 6.0], [68.4, 6.0], [68.5, 6.0], [68.6, 6.0], [68.7, 6.0], [68.8, 6.0], [68.9, 6.0], [69.0, 6.0], [69.1, 6.0], [69.2, 6.0], [69.3, 6.0], [69.4, 6.0], [69.5, 6.0], [69.6, 6.0], [69.7, 6.0], [69.8, 6.0], [69.9, 6.0], [70.0, 6.0], [70.1, 6.0], [70.2, 6.0], [70.3, 6.0], [70.4, 6.0], [70.5, 6.0], [70.6, 6.0], [70.7, 6.0], [70.8, 6.0], [70.9, 6.0], [71.0, 6.0], [71.1, 6.0], [71.2, 6.0], [71.3, 6.0], [71.4, 6.0], [71.5, 6.0], [71.6, 6.0], [71.7, 6.0], [71.8, 6.0], [71.9, 6.0], [72.0, 6.0], [72.1, 6.0], [72.2, 6.0], [72.3, 6.0], [72.4, 6.0], [72.5, 6.0], [72.6, 6.0], [72.7, 6.0], [72.8, 6.0], [72.9, 6.0], [73.0, 6.0], [73.1, 6.0], [73.2, 6.0], [73.3, 6.0], [73.4, 6.0], [73.5, 6.0], [73.6, 6.0], [73.7, 6.0], [73.8, 6.0], [73.9, 6.0], [74.0, 6.0], [74.1, 6.0], [74.2, 6.0], [74.3, 6.0], [74.4, 6.0], [74.5, 6.0], [74.6, 6.0], [74.7, 6.0], [74.8, 6.0], [74.9, 6.0], [75.0, 6.0], [75.1, 6.0], [75.2, 6.0], [75.3, 6.0], [75.4, 6.0], [75.5, 6.0], [75.6, 6.0], [75.7, 6.0], [75.8, 6.0], [75.9, 6.0], [76.0, 6.0], [76.1, 6.0], [76.2, 6.0], [76.3, 6.0], [76.4, 6.0], [76.5, 7.0], [76.6, 7.0], [76.7, 7.0], [76.8, 7.0], [76.9, 7.0], [77.0, 7.0], [77.1, 7.0], [77.2, 7.0], [77.3, 7.0], [77.4, 7.0], [77.5, 7.0], [77.6, 7.0], [77.7, 7.0], [77.8, 7.0], [77.9, 7.0], [78.0, 7.0], [78.1, 7.0], [78.2, 7.0], [78.3, 7.0], [78.4, 7.0], [78.5, 7.0], [78.6, 7.0], [78.7, 7.0], [78.8, 7.0], [78.9, 7.0], [79.0, 7.0], [79.1, 7.0], [79.2, 7.0], [79.3, 7.0], [79.4, 7.0], [79.5, 7.0], [79.6, 7.0], [79.7, 7.0], [79.8, 7.0], [79.9, 7.0], [80.0, 7.0], [80.1, 7.0], [80.2, 7.0], [80.3, 7.0], [80.4, 7.0], [80.5, 7.0], [80.6, 7.0], [80.7, 7.0], [80.8, 7.0], [80.9, 7.0], [81.0, 7.0], [81.1, 7.0], [81.2, 7.0], [81.3, 7.0], [81.4, 7.0], [81.5, 7.0], [81.6, 7.0], [81.7, 7.0], [81.8, 7.0], [81.9, 7.0], [82.0, 7.0], [82.1, 7.0], [82.2, 7.0], [82.3, 7.0], [82.4, 7.0], [82.5, 7.0], [82.6, 7.0], [82.7, 7.0], [82.8, 7.0], [82.9, 7.0], [83.0, 7.0], [83.1, 7.0], [83.2, 7.0], [83.3, 7.0], [83.4, 7.0], [83.5, 7.0], [83.6, 7.0], [83.7, 7.0], [83.8, 8.0], [83.9, 8.0], [84.0, 8.0], [84.1, 8.0], [84.2, 8.0], [84.3, 8.0], [84.4, 8.0], [84.5, 8.0], [84.6, 8.0], [84.7, 8.0], [84.8, 8.0], [84.9, 8.0], [85.0, 8.0], [85.1, 8.0], [85.2, 8.0], [85.3, 8.0], [85.4, 8.0], [85.5, 8.0], [85.6, 8.0], [85.7, 8.0], [85.8, 8.0], [85.9, 8.0], [86.0, 8.0], [86.1, 8.0], [86.2, 8.0], [86.3, 8.0], [86.4, 8.0], [86.5, 8.0], [86.6, 8.0], [86.7, 8.0], [86.8, 8.0], [86.9, 8.0], [87.0, 8.0], [87.1, 8.0], [87.2, 8.0], [87.3, 8.0], [87.4, 8.0], [87.5, 8.0], [87.6, 8.0], [87.7, 8.0], [87.8, 8.0], [87.9, 8.0], [88.0, 8.0], [88.1, 9.0], [88.2, 9.0], [88.3, 9.0], [88.4, 9.0], [88.5, 9.0], [88.6, 9.0], [88.7, 9.0], [88.8, 9.0], [88.9, 9.0], [89.0, 9.0], [89.1, 9.0], [89.2, 9.0], [89.3, 9.0], [89.4, 9.0], [89.5, 9.0], [89.6, 9.0], [89.7, 9.0], [89.8, 9.0], [89.9, 9.0], [90.0, 9.0], [90.1, 9.0], [90.2, 9.0], [90.3, 9.0], [90.4, 9.0], [90.5, 9.0], [90.6, 9.0], [90.7, 9.0], [90.8, 10.0], [90.9, 10.0], [91.0, 10.0], [91.1, 10.0], [91.2, 10.0], [91.3, 10.0], [91.4, 10.0], [91.5, 10.0], [91.6, 10.0], [91.7, 10.0], [91.8, 10.0], [91.9, 10.0], [92.0, 10.0], [92.1, 10.0], [92.2, 10.0], [92.3, 10.0], [92.4, 11.0], [92.5, 11.0], [92.6, 11.0], [92.7, 11.0], [92.8, 11.0], [92.9, 11.0], [93.0, 11.0], [93.1, 11.0], [93.2, 11.0], [93.3, 11.0], [93.4, 11.0], [93.5, 12.0], [93.6, 12.0], [93.7, 12.0], [93.8, 12.0], [93.9, 12.0], [94.0, 12.0], [94.1, 13.0], [94.2, 13.0], [94.3, 13.0], [94.4, 13.0], [94.5, 14.0], [94.6, 14.0], [94.7, 14.0], [94.8, 15.0], [94.9, 15.0], [95.0, 16.0], [95.1, 16.0], [95.2, 17.0], [95.3, 18.0], [95.4, 19.0], [95.5, 21.0], [95.6, 22.0], [95.7, 24.0], [95.8, 27.0], [95.9, 33.0], [96.0, 40.0], [96.1, 48.0], [96.2, 59.0], [96.3, 64.0], [96.4, 68.0], [96.5, 78.0], [96.6, 412.0], [96.7, 569.0], [96.8, 686.0], [96.9, 767.0], [97.0, 835.0], [97.1, 906.0], [97.2, 983.0], [97.3, 1096.0], [97.4, 2441.0], [97.5, 4141.0], [97.6, 4544.0], [97.7, 4839.0], [97.8, 5056.0], [97.9, 5245.0], [98.0, 5418.0], [98.1, 5577.0], [98.2, 5729.0], [98.3, 5877.0], [98.4, 6023.0], [98.5, 6169.0], [98.6, 6308.0], [98.7, 6450.0], [98.8, 6578.0], [98.9, 6716.0], [99.0, 6851.0], [99.1, 6997.0], [99.2, 7139.0], [99.3, 7293.0], [99.4, 7470.0], [99.5, 7656.0], [99.6, 7877.0], [99.7, 8190.0], [99.8, 8733.0], [99.9, 12515.0], [100.0, 276749.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 1260498.0, "series": [{"data": [[0.0, 1260498.0], [100.0, 270.0], [276700.0, 1.0], [33300.0, 2.0], [35300.0, 1.0], [36900.0, 1.0], [200.0, 227.0], [300.0, 314.0], [400.0, 775.0], [500.0, 914.0], [600.0, 1224.0], [700.0, 1702.0], [800.0, 1900.0], [900.0, 1624.0], [1000.0, 1126.0], [1100.0, 496.0], [1200.0, 213.0], [1300.0, 114.0], [1400.0, 91.0], [1500.0, 87.0], [1600.0, 71.0], [1700.0, 53.0], [1800.0, 37.0], [1900.0, 32.0], [2000.0, 19.0], [2100.0, 22.0], [2200.0, 15.0], [2300.0, 16.0], [2400.0, 24.0], [2500.0, 21.0], [2600.0, 25.0], [2800.0, 27.0], [2700.0, 18.0], [2900.0, 30.0], [3000.0, 32.0], [3100.0, 55.0], [3200.0, 53.0], [3300.0, 57.0], [3400.0, 72.0], [3500.0, 89.0], [3700.0, 120.0], [3600.0, 104.0], [3800.0, 158.0], [3900.0, 165.0], [4000.0, 180.0], [4200.0, 275.0], [4300.0, 347.0], [4100.0, 236.0], [4400.0, 359.0], [4600.0, 424.0], [4500.0, 419.0], [4700.0, 439.0], [4800.0, 540.0], [4900.0, 617.0], [5100.0, 709.0], [5000.0, 631.0], [5200.0, 728.0], [5300.0, 757.0], [5400.0, 787.0], [5500.0, 844.0], [5600.0, 866.0], [5700.0, 885.0], [5800.0, 874.0], [6100.0, 884.0], [6000.0, 857.0], [5900.0, 919.0], [6200.0, 975.0], [6300.0, 925.0], [6400.0, 940.0], [6600.0, 939.0], [6500.0, 1044.0], [6800.0, 969.0], [6700.0, 934.0], [6900.0, 872.0], [7000.0, 950.0], [7100.0, 856.0], [7200.0, 838.0], [7400.0, 739.0], [7300.0, 752.0], [7500.0, 692.0], [7600.0, 658.0], [7900.0, 438.0], [7800.0, 557.0], [7700.0, 598.0], [8100.0, 358.0], [8000.0, 409.0], [8600.0, 146.0], [8400.0, 237.0], [8700.0, 164.0], [8200.0, 309.0], [8500.0, 233.0], [8300.0, 285.0], [8800.0, 122.0], [9200.0, 56.0], [9100.0, 61.0], [8900.0, 102.0], [9000.0, 93.0], [9600.0, 41.0], [9400.0, 60.0], [9700.0, 37.0], [9300.0, 58.0], [9500.0, 44.0], [10000.0, 31.0], [10200.0, 28.0], [9900.0, 28.0], [9800.0, 33.0], [10100.0, 44.0], [10400.0, 21.0], [10700.0, 21.0], [10500.0, 23.0], [10600.0, 19.0], [10300.0, 22.0], [11100.0, 14.0], [11200.0, 22.0], [11000.0, 30.0], [10900.0, 19.0], [10800.0, 14.0], [11600.0, 19.0], [11700.0, 14.0], [11300.0, 11.0], [11500.0, 12.0], [11400.0, 19.0], [11800.0, 10.0], [12200.0, 9.0], [11900.0, 16.0], [12100.0, 17.0], [12000.0, 15.0], [12500.0, 14.0], [12300.0, 10.0], [12700.0, 16.0], [12400.0, 13.0], [12600.0, 14.0], [13300.0, 17.0], [13000.0, 19.0], [12900.0, 18.0], [13200.0, 14.0], [12800.0, 19.0], [13100.0, 11.0], [13400.0, 17.0], [13600.0, 11.0], [13700.0, 10.0], [13500.0, 9.0], [13800.0, 11.0], [14100.0, 9.0], [14000.0, 7.0], [13900.0, 12.0], [14300.0, 12.0], [14200.0, 8.0], [14700.0, 6.0], [14800.0, 8.0], [14600.0, 7.0], [14500.0, 11.0], [14400.0, 11.0], [15300.0, 4.0], [14900.0, 7.0], [15000.0, 4.0], [15100.0, 3.0], [15200.0, 3.0], [15500.0, 2.0], [15700.0, 2.0], [15800.0, 2.0], [15600.0, 1.0], [15400.0, 3.0], [15900.0, 5.0], [16200.0, 2.0], [16000.0, 2.0], [16100.0, 4.0], [16300.0, 1.0], [17200.0, 1.0], [16600.0, 2.0], [17400.0, 1.0], [16400.0, 2.0], [16800.0, 1.0], [17000.0, 1.0], [18400.0, 5.0], [17600.0, 4.0], [18000.0, 3.0], [18600.0, 140.0], [19000.0, 31.0], [18800.0, 71.0], [19400.0, 29.0], [19200.0, 14.0], [20400.0, 16.0], [20200.0, 5.0], [19600.0, 19.0], [19800.0, 5.0], [20000.0, 5.0], [21200.0, 3.0], [20600.0, 7.0], [20800.0, 1.0], [21000.0, 1.0], [23200.0, 1.0], [24200.0, 1.0], [25400.0, 1.0], [28000.0, 1.0], [29200.0, 2.0], [30600.0, 1.0], [30800.0, 1.0], [31000.0, 1.0], [34000.0, 1.0], [36400.0, 1.0], [38400.0, 1.0], [67900.0, 1.0], [35500.0, 1.0], [16500.0, 2.0], [16700.0, 3.0], [18100.0, 1.0], [18300.0, 3.0], [19300.0, 14.0], [18900.0, 33.0], [19100.0, 49.0], [18700.0, 104.0], [18500.0, 298.0], [20100.0, 13.0], [19500.0, 14.0], [19700.0, 10.0], [20300.0, 2.0], [19900.0, 8.0], [20900.0, 2.0], [20700.0, 4.0], [20500.0, 11.0], [22700.0, 1.0], [24300.0, 1.0], [25300.0, 1.0], [25700.0, 1.0], [28100.0, 1.0], [31300.0, 1.0], [31500.0, 1.0], [31700.0, 2.0], [30900.0, 1.0], [32100.0, 1.0], [34600.0, 1.0], [35000.0, 1.0], [51800.0, 1.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 276700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 1034.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1262469.0, "series": [{"data": [[1.0, 9366.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 1262469.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1034.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 32930.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 145.22840034217234, "minX": 1.5254193E12, "maxY": 150.0, "series": [{"data": [[1.52541942E12, 150.0], [1.52541972E12, 150.0], [1.52542032E12, 150.0], [1.52542002E12, 150.0], [1.52542044E12, 150.0], [1.52542014E12, 150.0], [1.52542074E12, 150.0], [1.5254202E12, 150.0], [1.5254199E12, 150.0], [1.5254208E12, 150.0], [1.5254205E12, 150.0], [1.52542092E12, 149.6225102814287], [1.52542062E12, 150.0], [1.5254193E12, 145.22840034217234], [1.5254196E12, 150.0], [1.52542068E12, 150.0], [1.52542038E12, 150.0], [1.52541936E12, 150.0], [1.52541948E12, 150.0], [1.52541978E12, 150.0], [1.52542008E12, 150.0], [1.52542086E12, 150.0], [1.52541954E12, 150.0], [1.52541984E12, 150.0], [1.52541966E12, 150.0], [1.52541996E12, 150.0], [1.52542056E12, 150.0], [1.52542026E12, 150.0]], "isOverall": false, "label": "Digisoria Customer 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52542092E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 4.0, "minX": 1.0, "maxY": 7631.0, "series": [{"data": [[2.0, 6573.0], [3.0, 5167.0], [4.0, 1281.0], [5.0, 1640.0], [6.0, 5491.0], [7.0, 210.0], [8.0, 4181.0], [9.0, 70.0], [10.0, 2952.0], [11.0, 2896.0], [12.0, 3835.0], [13.0, 2475.0], [15.0, 2471.0], [16.0, 522.0], [17.0, 1044.0], [18.0, 3112.0], [19.0, 1983.0], [20.0, 2484.0], [21.0, 2081.0], [22.0, 605.0], [23.0, 1673.0], [24.0, 905.5], [25.0, 7.0], [26.0, 64.33333333333334], [27.0, 2156.0], [28.0, 326.0], [29.0, 4588.0], [30.0, 1946.0], [31.0, 804.0], [33.0, 1673.5], [32.0, 6516.0], [34.0, 290.33333333333337], [35.0, 7.5], [37.0, 661.3333333333334], [36.0, 5643.0], [39.0, 1037.0], [38.0, 2841.0], [41.0, 5366.0], [40.0, 1722.0], [42.0, 1870.5], [43.0, 4.0], [45.0, 1022.0], [44.0, 1468.0], [46.0, 1701.0], [47.0, 390.0], [48.0, 3111.5], [49.0, 1064.3333333333333], [50.0, 695.0], [51.0, 1524.0], [52.0, 1070.6], [53.0, 1888.5], [54.0, 1702.3333333333335], [55.0, 2417.0], [56.0, 2520.3333333333335], [57.0, 3332.75], [58.0, 2060.3333333333335], [59.0, 4834.5], [60.0, 1025.3333333333333], [61.0, 3789.5], [62.0, 3191.5], [63.0, 3356.0], [67.0, 332.3333333333333], [66.0, 1815.25], [65.0, 6240.0], [64.0, 3458.0], [71.0, 2058.3333333333335], [68.0, 186.88888888888889], [75.0, 659.0], [74.0, 3415.0], [73.0, 2897.0], [76.0, 4187.0], [78.0, 2121.0], [79.0, 2802.0], [77.0, 5551.0], [80.0, 1914.2000000000003], [81.0, 1650.2500000000002], [82.0, 4758.5], [83.0, 2425.0], [84.0, 1758.0], [86.0, 2172.0], [87.0, 2592.0], [85.0, 3657.0], [88.0, 1268.0], [91.0, 3129.0], [90.0, 4490.0], [89.0, 31.0], [93.0, 3318.5], [95.0, 2130.5], [94.0, 35.0], [92.0, 212.0], [97.0, 5315.666666666667], [99.0, 3244.8333333333335], [98.0, 672.8], [96.0, 7631.0], [101.0, 5004.0], [102.0, 1211.3333333333333], [103.0, 2678.5], [105.0, 1275.3333333333335], [106.0, 966.75], [107.0, 1419.8], [104.0, 536.5], [109.0, 2498.0], [110.0, 1990.0], [111.0, 3968.0], [108.0, 1135.6666666666667], [112.0, 1775.0909090909086], [113.0, 3986.6666666666665], [115.0, 1218.75], [114.0, 105.83333333333333], [116.0, 3671.6666666666665], [117.0, 3328.8333333333335], [118.0, 919.8], [119.0, 3824.0], [121.0, 4470.5], [123.0, 4238.0], [122.0, 1636.5], [120.0, 460.49999999999994], [126.0, 1206.5], [124.0, 954.8], [128.0, 1940.2], [130.0, 3527.0], [131.0, 2467.5], [133.0, 3069.0], [134.0, 5093.5], [135.0, 1580.6666666666665], [132.0, 471.3333333333333], [129.0, 958.25], [136.0, 1112.375], [137.0, 993.5], [142.0, 2869.0], [143.0, 6043.0], [141.0, 466.5], [140.0, 838.5], [139.0, 947.8888888888889], [138.0, 1368.25], [144.0, 1099.7142857142858], [147.0, 2367.5], [150.0, 190.29678796789366], [149.0, 885.0], [148.0, 1110.0], [146.0, 837.2727272727273], [145.0, 3821.0], [1.0, 4115.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}, {"data": [[149.98138764082813, 190.83190368501917]], "isOverall": false, "label": "Digisoria Shopfront 132-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 150.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 12765.233333333334, "minX": 1.5254193E12, "maxY": 1947619.7666666666, "series": [{"data": [[1.52541942E12, 303476.81666666665], [1.52541972E12, 260624.68333333332], [1.52542032E12, 548025.7], [1.52542002E12, 642153.6833333333], [1.52542044E12, 418341.6666666667], [1.52542014E12, 432654.63333333336], [1.52542074E12, 1201559.3166666667], [1.5254202E12, 553809.35], [1.5254199E12, 1063096.8666666667], [1.5254208E12, 929254.25], [1.5254205E12, 602979.7666666667], [1.52542092E12, 695972.7], [1.52542062E12, 896780.2], [1.5254193E12, 217117.08333333334], [1.5254196E12, 488374.18333333335], [1.52542068E12, 934201.6], [1.52542038E12, 555342.2166666667], [1.52541936E12, 291777.95], [1.52541948E12, 305893.9], [1.52541978E12, 1516601.4166666667], [1.52542008E12, 397200.1666666667], [1.52542086E12, 839978.0333333333], [1.52541954E12, 302954.4166666667], [1.52541984E12, 1596963.4666666666], [1.52541966E12, 532009.9333333333], [1.52541996E12, 514079.1], [1.52542056E12, 817880.2], [1.52542026E12, 560401.9666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52541942E12, 19937.733333333334], [1.52541972E12, 281158.4], [1.52542032E12, 384910.1666666667], [1.52542002E12, 517243.0], [1.52542044E12, 196904.46666666667], [1.52542014E12, 214181.43333333332], [1.52542074E12, 1308302.3], [1.5254202E12, 392137.4666666667], [1.5254199E12, 1249534.9666666666], [1.5254208E12, 957517.0333333333], [1.5254205E12, 447728.9], [1.52542092E12, 602825.3333333334], [1.52542062E12, 816826.7666666667], [1.5254193E12, 12765.233333333334], [1.5254196E12, 293452.6666666667], [1.52542068E12, 914257.9], [1.52542038E12, 391039.8333333333], [1.52541936E12, 19169.566666666666], [1.52541948E12, 20095.266666666666], [1.52541978E12, 1842194.4], [1.52542008E12, 153366.53333333333], [1.52542086E12, 763302.5], [1.52541954E12, 19906.833333333332], [1.52541984E12, 1947619.7666666666], [1.52541966E12, 521846.5], [1.52541996E12, 465600.5], [1.52542056E12, 769539.4333333333], [1.52542026E12, 396594.93333333335]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52542092E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 56.41555059056804, "minX": 1.5254193E12, "maxY": 6465.532078699743, "series": [{"data": [[1.52541942E12, 5490.306609547125], [1.52541972E12, 400.2417577724655], [1.52542032E12, 284.96891060212175], [1.52542002E12, 211.69682917068747], [1.52542044E12, 561.2794236382828], [1.52542014E12, 510.62208938229196], [1.52542074E12, 84.18606513117416], [1.5254202E12, 280.9748084947347], [1.5254199E12, 68.3357162415904], [1.5254208E12, 113.04842075793374], [1.5254205E12, 245.15347180686436], [1.52542092E12, 156.5774735908381], [1.52542062E12, 133.6574617746124], [1.5254193E12, 6465.532078699743], [1.5254196E12, 378.0259615384602], [1.52542068E12, 118.79112803376184], [1.52542038E12, 280.06879215588447], [1.52541936E12, 5690.725015913441], [1.52541948E12, 5431.551305403765], [1.52541978E12, 59.83438522441415], [1.52542008E12, 712.8789226980211], [1.52542086E12, 145.73170342217585], [1.52541954E12, 5593.511029411764], [1.52541984E12, 56.41555059056804], [1.52541966E12, 203.64061878349588], [1.52541996E12, 283.45371188113995], [1.52542056E12, 141.97192210956288], [1.52542026E12, 276.2767942362776]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52542092E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 22.73577895456094, "minX": 1.5254193E12, "maxY": 4513.533789563725, "series": [{"data": [[1.52541942E12, 3789.531211750308], [1.52541972E12, 22.73577895456094], [1.52542032E12, 196.90254425480572], [1.52542002E12, 147.02389303453165], [1.52542044E12, 400.87143655673606], [1.52542014E12, 359.1186450327377], [1.52542074E12, 60.784394957826485], [1.5254202E12, 195.60864420501966], [1.5254199E12, 46.67968627757808], [1.5254208E12, 83.88176681682936], [1.5254205E12, 175.19688978304634], [1.52542092E12, 104.39698411418452], [1.52542062E12, 93.80361241095646], [1.5254193E12, 4513.533789563725], [1.5254196E12, 265.9723244147155], [1.52542068E12, 86.72922130656411], [1.52542038E12, 194.6433300024987], [1.52541936E12, 3949.625079567151], [1.52541948E12, 3764.16393442623], [1.52541978E12, 43.35170326716686], [1.52542008E12, 493.75736871375227], [1.52542086E12, 102.54877756663136], [1.52541954E12, 3772.2549019607823], [1.52541984E12, 39.09871468199552], [1.52541966E12, 104.91787778791941], [1.52541996E12, 94.34435555093874], [1.52542056E12, 104.45829444611505], [1.52542026E12, 191.3995812678968]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52542092E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.7127929307509762, "minX": 1.5254193E12, "maxY": 365.15258797403504, "series": [{"data": [[1.52541942E12, 46.71603427172584], [1.52541972E12, 365.15258797403504], [1.52542032E12, 2.8019161220734543], [1.52542002E12, 2.1342717920952956], [1.52542044E12, 5.094776721942732], [1.52542014E12, 5.155081127241666], [1.52542074E12, 0.9624629936507253], [1.5254202E12, 2.7424487762346614], [1.5254199E12, 2.028702472226571], [1.5254208E12, 1.2228500165432432], [1.5254205E12, 2.1641291936273115], [1.52542092E12, 1.6909926618821012], [1.52542062E12, 1.610786563738796], [1.5254193E12, 62.1881950384944], [1.5254196E12, 3.886162207357821], [1.52542068E12, 1.231331460599367], [1.52542038E12, 2.764364226829877], [1.52541936E12, 50.532145130490186], [1.52541948E12, 48.964177292046266], [1.52541978E12, 0.7535123870959286], [1.52542008E12, 7.5389687773099165], [1.52542086E12, 1.5795180530493003], [1.52541954E12, 51.44240196078428], [1.52541984E12, 0.7127929307509762], [1.52541966E12, 66.65304594069606], [1.52541996E12, 145.48399916878878], [1.52542056E12, 1.6564057136529728], [1.52542026E12, 2.726192308876512]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52542092E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 315.0, "minX": 1.5254193E12, "maxY": 67909.0, "series": [{"data": [[1.52541942E12, 36957.0], [1.52541972E12, 6937.0], [1.52542032E12, 9032.0], [1.52542002E12, 20687.0], [1.52542044E12, 14734.0], [1.52542014E12, 34070.0], [1.52542074E12, 25435.0], [1.5254202E12, 35051.0], [1.5254199E12, 19230.0], [1.5254208E12, 34669.0], [1.5254205E12, 20192.0], [1.52542092E12, 10510.0], [1.52542062E12, 30913.0], [1.5254193E12, 10492.0], [1.5254196E12, 36410.0], [1.52542068E12, 20909.0], [1.52542038E12, 16771.0], [1.52541936E12, 10437.0], [1.52541948E12, 35572.0], [1.52541978E12, 19633.0], [1.52542008E12, 10486.0], [1.52542086E12, 18085.0], [1.52541954E12, 38484.0], [1.52541984E12, 8072.0], [1.52541966E12, 67909.0], [1.52541996E12, 9116.0], [1.52542056E12, 18842.0], [1.52542026E12, 8415.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52541942E12, 320.0], [1.52541972E12, 322.0], [1.52542032E12, 316.0], [1.52542002E12, 328.0], [1.52542044E12, 380.0], [1.52542014E12, 507.0], [1.52542074E12, 332.0], [1.5254202E12, 319.0], [1.5254199E12, 396.0], [1.5254208E12, 319.0], [1.5254205E12, 353.0], [1.52542092E12, 344.0], [1.52542062E12, 375.0], [1.5254193E12, 847.0], [1.5254196E12, 355.0], [1.52542068E12, 344.0], [1.52542038E12, 315.0], [1.52541936E12, 320.0], [1.52541948E12, 320.0], [1.52541978E12, 341.0], [1.52542008E12, 335.0], [1.52542086E12, 331.0], [1.52541954E12, 344.0], [1.52541984E12, 332.0], [1.52541966E12, 327.0], [1.52541996E12, 329.0], [1.52542056E12, 319.0], [1.52542026E12, 399.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52541942E12, 7659.0], [1.52541972E12, 7967.0], [1.52542032E12, 7709.0], [1.52542002E12, 7723.0], [1.52542044E12, 7615.0], [1.52542014E12, 7798.9000000000015], [1.52542074E12, 8042.9000000000015], [1.5254202E12, 7835.0], [1.5254199E12, 7814.0], [1.5254208E12, 8097.9000000000015], [1.5254205E12, 7608.0], [1.52542092E12, 7965.0], [1.52542062E12, 7809.9000000000015], [1.5254193E12, 7819.0], [1.5254196E12, 7920.0], [1.52542068E12, 7937.0], [1.52542038E12, 7664.0], [1.52541936E12, 7703.6], [1.52541948E12, 7800.8], [1.52541978E12, 7992.0], [1.52542008E12, 7728.200000000001], [1.52542086E12, 7997.9000000000015], [1.52541954E12, 7853.0], [1.52541984E12, 7885.9], [1.52541966E12, 7992.0], [1.52541996E12, 7781.0], [1.52542056E12, 7680.9000000000015], [1.52542026E12, 7805.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52541942E12, 8689.75], [1.52541972E12, 10491.95], [1.52542032E12, 10055.0], [1.52542002E12, 9967.800000000036], [1.52542044E12, 10127.820000000029], [1.52542014E12, 10057.0], [1.52542074E12, 12987.88000000002], [1.5254202E12, 10288.760000000038], [1.5254199E12, 10296.549999999992], [1.5254208E12, 13244.890000000018], [1.5254205E12, 11196.13000000014], [1.52542092E12, 13268.980000000003], [1.52542062E12, 12011.960000000006], [1.5254193E12, 9071.499999999995], [1.5254196E12, 9936.899999999998], [1.52542068E12, 12767.900000000016], [1.52542038E12, 9770.910000000014], [1.52541936E12, 8825.900000000001], [1.52541948E12, 9124.139999999996], [1.52541978E12, 10830.64], [1.52542008E12, 9767.599999999999], [1.52542086E12, 13293.75000000004], [1.52541954E12, 9496.760000000002], [1.52541984E12, 10491.69], [1.52541966E12, 10562.739999999994], [1.52541996E12, 10124.19000000001], [1.52542056E12, 12007.540000000074], [1.52542026E12, 10264.950000000008]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52541942E12, 8004.75], [1.52541972E12, 8481.0], [1.52542032E12, 8235.900000000001], [1.52542002E12, 8249.399999999998], [1.52542044E12, 8113.9000000000015], [1.52542014E12, 8319.0], [1.52542074E12, 8684.95], [1.5254202E12, 8350.0], [1.5254199E12, 8354.0], [1.5254208E12, 8877.900000000001], [1.5254205E12, 8092.950000000001], [1.52542092E12, 8805.800000000003], [1.52542062E12, 8337.900000000001], [1.5254193E12, 8262.0], [1.5254196E12, 8409.9], [1.52542068E12, 8539.0], [1.52542038E12, 8163.950000000001], [1.52541936E12, 8061.9], [1.52541948E12, 8216.0], [1.52541978E12, 8525.4], [1.52542008E12, 8222.0], [1.52542086E12, 8818.95], [1.52541954E12, 8313.0], [1.52541984E12, 8419.899999999998], [1.52541966E12, 8496.9], [1.52541996E12, 8316.15], [1.52542056E12, 8217.95], [1.52542026E12, 8332.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52542092E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 5.0, "minX": 19.0, "maxY": 276749.0, "series": [{"data": [[535.0, 5812.0], [541.0, 6245.0], [525.0, 6356.0], [533.0, 6138.0], [613.0, 5887.0], [641.0, 6031.0], [712.0, 6607.5], [708.0, 6206.0], [826.0, 5379.5], [1053.0, 4946.0], [1043.0, 5421.5], [1118.0, 4429.5], [1251.0, 4160.0], [1309.0, 5042.0], [1704.0, 5654.5], [1790.0, 4565.0], [2511.0, 5274.0], [2655.0, 5683.0], [209.0, 5997.5], [268.0, 6199.0], [292.0, 5275.0], [19.0, 6608.0], [398.0, 5446.0], [390.0, 1376.0], [26.0, 6556.0], [27.0, 6045.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[535.0, 5.0], [541.0, 5.0], [525.0, 5.0], [533.0, 5.0], [2511.0, 5.0], [613.0, 5.0], [2655.0, 5.0], [641.0, 5.0], [712.0, 5.0], [708.0, 5.0], [826.0, 5.0], [209.0, 5.0], [268.0, 5.0], [1053.0, 5.0], [1043.0, 5.0], [1118.0, 5.0], [292.0, 5.0], [1251.0, 5.0], [1309.0, 5.0], [398.0, 5.0], [390.0, 5.0], [1704.0, 5.0], [27.0, 276749.0], [1790.0, 6.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2655.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 5.0, "minX": 19.0, "maxY": 4806.0, "series": [{"data": [[535.0, 3740.0], [541.0, 4280.0], [525.0, 4333.0], [533.0, 4145.0], [613.0, 3912.5], [641.0, 3941.0], [712.0, 4806.0], [708.0, 4219.0], [826.0, 3355.0], [1053.0, 3130.0], [1043.0, 3481.5], [1118.0, 2820.0], [1251.0, 2625.0], [1309.0, 3232.0], [1704.0, 3737.5], [1790.0, 2852.0], [2511.0, 3302.0], [2655.0, 3641.0], [209.0, 4007.5], [268.0, 4189.0], [292.0, 3345.5], [19.0, 4644.0], [398.0, 3475.0], [390.0, 696.0], [26.0, 4504.0], [27.0, 4027.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[535.0, 5.0], [541.0, 5.0], [525.0, 5.0], [533.0, 5.0], [2511.0, 5.0], [613.0, 5.0], [2655.0, 5.0], [641.0, 5.0], [712.0, 5.0], [708.0, 5.0], [826.0, 5.0], [209.0, 5.0], [268.0, 5.0], [1053.0, 5.0], [1043.0, 5.0], [1118.0, 5.0], [292.0, 5.0], [1251.0, 5.0], [1309.0, 5.0], [398.0, 5.0], [390.0, 5.0], [1704.0, 5.0], [27.0, 3418.0], [1790.0, 6.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 2655.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 21.983333333333334, "minX": 1.5254193E12, "maxY": 2655.633333333333, "series": [{"data": [[1.52541942E12, 27.216666666666665], [1.52541972E12, 390.25], [1.52542032E12, 525.3666666666667], [1.52542002E12, 708.05], [1.52542044E12, 268.35], [1.52542014E12, 292.75], [1.52542074E12, 1790.2], [1.5254202E12, 535.2333333333333], [1.5254199E12, 1704.2666666666667], [1.5254208E12, 1309.7333333333333], [1.5254205E12, 613.0333333333333], [1.52542092E12, 824.2666666666667], [1.52542062E12, 1118.3666666666666], [1.5254193E12, 21.983333333333334], [1.5254196E12, 398.6666666666667], [1.52542068E12, 1251.9], [1.52542038E12, 533.7333333333333], [1.52541936E12, 26.183333333333334], [1.52541948E12, 27.466666666666665], [1.52541978E12, 2511.366666666667], [1.52542008E12, 209.78333333333333], [1.52542086E12, 1043.65], [1.52541954E12, 27.2], [1.52541984E12, 2655.633333333333], [1.52541966E12, 712.15], [1.52541996E12, 641.6], [1.52542056E12, 1053.6], [1.52542026E12, 541.3166666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52542092E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.5254193E12, "maxY": 2628.3166666666666, "series": [{"data": [[1.52541942E12, 27.233333333333334], [1.52541972E12, 5.05], [1.52542032E12, 27.183333333333334], [1.52542002E12, 27.583333333333332], [1.52542044E12, 26.816666666666666], [1.52542014E12, 27.133333333333333], [1.52542074E12, 30.383333333333333], [1.5254202E12, 27.316666666666666], [1.5254199E12, 21.066666666666666], [1.5254208E12, 26.783333333333335], [1.5254205E12, 28.466666666666665], [1.52542092E12, 26.633333333333333], [1.52542062E12, 32.8], [1.5254193E12, 19.483333333333334], [1.5254196E12, 27.483333333333334], [1.52542068E12, 30.116666666666667], [1.52542038E12, 27.483333333333334], [1.52541936E12, 26.183333333333334], [1.52541948E12, 27.45], [1.52541978E12, 26.45], [1.52542008E12, 27.6], [1.52542086E12, 30.6], [1.52541954E12, 27.183333333333334], [1.52541984E12, 27.316666666666666], [1.52541966E12, 16.666666666666668], [1.52541996E12, 17.7], [1.52542056E12, 28.383333333333333], [1.52542026E12, 27.616666666666667]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52542068E12, 0.4666666666666667], [1.52542086E12, 1.1833333333333333], [1.5254208E12, 2.4833333333333334], [1.5254205E12, 0.4], [1.52542044E12, 1.4], [1.52542092E12, 0.05], [1.52541996E12, 0.016666666666666666], [1.52542056E12, 1.6], [1.52542074E12, 0.6]], "isOverall": false, "label": "500", "isController": false}, {"data": [[1.52542068E12, 158.1], [1.5254208E12, 75.75], [1.5254205E12, 80.78333333333333], [1.52542062E12, 176.26666666666668], [1.52542056E12, 170.51666666666668], [1.52542074E12, 154.33333333333334]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.52542068E12, 1063.2], [1.52542038E12, 506.25], [1.52541972E12, 377.8], [1.52542032E12, 498.18333333333334], [1.52542002E12, 680.4333333333333], [1.52542044E12, 240.13333333333333], [1.52542014E12, 265.6166666666667], [1.52541978E12, 2484.9], [1.52542074E12, 1604.9166666666667], [1.52542008E12, 182.18333333333334], [1.5254202E12, 507.9166666666667], [1.5254199E12, 1683.1], [1.52542086E12, 1011.9], [1.5254208E12, 1204.6833333333334], [1.5254205E12, 503.3833333333333], [1.52541984E12, 2628.3166666666666], [1.52542092E12, 797.55], [1.52541966E12, 693.0], [1.52542062E12, 909.3], [1.52541996E12, 619.05], [1.52542056E12, 853.1166666666667], [1.52542026E12, 513.7], [1.5254196E12, 371.18333333333334]], "isOverall": false, "label": "504", "isController": false}, {"data": [[1.52541954E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.ConnectionClosedException", "isController": false}, {"data": [[1.5254199E12, 0.1], [1.52541972E12, 7.416666666666667], [1.52542092E12, 2.5], [1.52541966E12, 2.4833333333333334], [1.52541996E12, 4.866666666666666]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52542092E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.5254193E12, "maxY": 2628.3166666666666, "series": [{"data": [[1.52541942E12, 27.233333333333334], [1.52541972E12, 5.05], [1.52542032E12, 27.183333333333334], [1.52542002E12, 27.583333333333332], [1.52542044E12, 26.816666666666666], [1.52542014E12, 27.133333333333333], [1.52542074E12, 30.383333333333333], [1.5254202E12, 27.316666666666666], [1.5254199E12, 21.066666666666666], [1.5254208E12, 26.783333333333335], [1.5254205E12, 28.466666666666665], [1.52542092E12, 26.633333333333333], [1.52542062E12, 32.8], [1.5254193E12, 19.483333333333334], [1.5254196E12, 27.483333333333334], [1.52542068E12, 30.116666666666667], [1.52542038E12, 27.483333333333334], [1.52541936E12, 26.183333333333334], [1.52541948E12, 27.45], [1.52541978E12, 26.45], [1.52542008E12, 27.6], [1.52542086E12, 30.6], [1.52541954E12, 27.183333333333334], [1.52541984E12, 27.316666666666666], [1.52541966E12, 16.666666666666668], [1.52541996E12, 17.7], [1.52542056E12, 28.383333333333333], [1.52542026E12, 27.616666666666667]], "isOverall": false, "label": "Digisoria Shopfront 132-success", "isController": false}, {"data": [[1.52542068E12, 1221.7666666666667], [1.52542038E12, 506.25], [1.52541972E12, 385.21666666666664], [1.52542032E12, 498.18333333333334], [1.52542002E12, 680.4333333333333], [1.52542044E12, 241.53333333333333], [1.52542014E12, 265.6166666666667], [1.52541978E12, 2484.9], [1.52542074E12, 1759.85], [1.52542008E12, 182.18333333333334], [1.5254202E12, 507.9166666666667], [1.5254199E12, 1683.2], [1.52542086E12, 1013.0833333333334], [1.5254208E12, 1282.9166666666667], [1.52541954E12, 0.016666666666666666], [1.5254205E12, 584.5666666666667], [1.52541984E12, 2628.3166666666666], [1.52542092E12, 800.1], [1.52541966E12, 695.4833333333333], [1.52542062E12, 1085.5666666666666], [1.52541996E12, 623.9333333333333], [1.52542056E12, 1025.2333333333333], [1.52542026E12, 513.7], [1.5254196E12, 371.18333333333334]], "isOverall": false, "label": "Digisoria Shopfront 132-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52542092E12, "title": "Transactions Per Second"}},
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

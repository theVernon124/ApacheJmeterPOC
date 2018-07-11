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
        data: {"result": {"minY": 3.0, "minX": 0.0, "maxY": 40020.0, "series": [{"data": [[0.0, 3.0], [0.1, 4.0], [0.2, 5.0], [0.3, 5.0], [0.4, 5.0], [0.5, 5.0], [0.6, 5.0], [0.7, 5.0], [0.8, 5.0], [0.9, 5.0], [1.0, 5.0], [1.1, 6.0], [1.2, 6.0], [1.3, 6.0], [1.4, 6.0], [1.5, 6.0], [1.6, 6.0], [1.7, 6.0], [1.8, 6.0], [1.9, 6.0], [2.0, 6.0], [2.1, 6.0], [2.2, 6.0], [2.3, 6.0], [2.4, 6.0], [2.5, 6.0], [2.6, 6.0], [2.7, 6.0], [2.8, 6.0], [2.9, 6.0], [3.0, 6.0], [3.1, 6.0], [3.2, 6.0], [3.3, 6.0], [3.4, 6.0], [3.5, 6.0], [3.6, 6.0], [3.7, 6.0], [3.8, 6.0], [3.9, 6.0], [4.0, 7.0], [4.1, 7.0], [4.2, 7.0], [4.3, 7.0], [4.4, 7.0], [4.5, 7.0], [4.6, 7.0], [4.7, 7.0], [4.8, 7.0], [4.9, 7.0], [5.0, 7.0], [5.1, 7.0], [5.2, 7.0], [5.3, 7.0], [5.4, 7.0], [5.5, 7.0], [5.6, 7.0], [5.7, 7.0], [5.8, 7.0], [5.9, 7.0], [6.0, 7.0], [6.1, 7.0], [6.2, 7.0], [6.3, 7.0], [6.4, 7.0], [6.5, 7.0], [6.6, 7.0], [6.7, 7.0], [6.8, 7.0], [6.9, 7.0], [7.0, 7.0], [7.1, 7.0], [7.2, 7.0], [7.3, 7.0], [7.4, 7.0], [7.5, 7.0], [7.6, 7.0], [7.7, 7.0], [7.8, 7.0], [7.9, 7.0], [8.0, 7.0], [8.1, 7.0], [8.2, 7.0], [8.3, 7.0], [8.4, 7.0], [8.5, 7.0], [8.6, 7.0], [8.7, 7.0], [8.8, 7.0], [8.9, 7.0], [9.0, 7.0], [9.1, 7.0], [9.2, 8.0], [9.3, 8.0], [9.4, 8.0], [9.5, 8.0], [9.6, 8.0], [9.7, 8.0], [9.8, 8.0], [9.9, 8.0], [10.0, 8.0], [10.1, 8.0], [10.2, 8.0], [10.3, 8.0], [10.4, 8.0], [10.5, 8.0], [10.6, 8.0], [10.7, 8.0], [10.8, 8.0], [10.9, 8.0], [11.0, 8.0], [11.1, 8.0], [11.2, 8.0], [11.3, 8.0], [11.4, 8.0], [11.5, 8.0], [11.6, 8.0], [11.7, 8.0], [11.8, 8.0], [11.9, 8.0], [12.0, 8.0], [12.1, 8.0], [12.2, 8.0], [12.3, 8.0], [12.4, 8.0], [12.5, 8.0], [12.6, 8.0], [12.7, 8.0], [12.8, 8.0], [12.9, 8.0], [13.0, 8.0], [13.1, 8.0], [13.2, 8.0], [13.3, 8.0], [13.4, 8.0], [13.5, 8.0], [13.6, 8.0], [13.7, 8.0], [13.8, 8.0], [13.9, 8.0], [14.0, 8.0], [14.1, 8.0], [14.2, 8.0], [14.3, 8.0], [14.4, 8.0], [14.5, 8.0], [14.6, 8.0], [14.7, 8.0], [14.8, 8.0], [14.9, 8.0], [15.0, 8.0], [15.1, 8.0], [15.2, 8.0], [15.3, 8.0], [15.4, 8.0], [15.5, 8.0], [15.6, 8.0], [15.7, 9.0], [15.8, 9.0], [15.9, 9.0], [16.0, 9.0], [16.1, 9.0], [16.2, 9.0], [16.3, 9.0], [16.4, 9.0], [16.5, 9.0], [16.6, 9.0], [16.7, 9.0], [16.8, 9.0], [16.9, 9.0], [17.0, 9.0], [17.1, 9.0], [17.2, 9.0], [17.3, 9.0], [17.4, 9.0], [17.5, 9.0], [17.6, 9.0], [17.7, 9.0], [17.8, 9.0], [17.9, 9.0], [18.0, 9.0], [18.1, 9.0], [18.2, 9.0], [18.3, 9.0], [18.4, 9.0], [18.5, 9.0], [18.6, 9.0], [18.7, 9.0], [18.8, 9.0], [18.9, 9.0], [19.0, 9.0], [19.1, 9.0], [19.2, 9.0], [19.3, 9.0], [19.4, 9.0], [19.5, 9.0], [19.6, 9.0], [19.7, 9.0], [19.8, 9.0], [19.9, 9.0], [20.0, 9.0], [20.1, 9.0], [20.2, 9.0], [20.3, 9.0], [20.4, 9.0], [20.5, 9.0], [20.6, 9.0], [20.7, 9.0], [20.8, 9.0], [20.9, 9.0], [21.0, 9.0], [21.1, 9.0], [21.2, 9.0], [21.3, 9.0], [21.4, 9.0], [21.5, 9.0], [21.6, 9.0], [21.7, 9.0], [21.8, 9.0], [21.9, 9.0], [22.0, 9.0], [22.1, 9.0], [22.2, 9.0], [22.3, 9.0], [22.4, 9.0], [22.5, 9.0], [22.6, 9.0], [22.7, 10.0], [22.8, 10.0], [22.9, 10.0], [23.0, 10.0], [23.1, 10.0], [23.2, 10.0], [23.3, 10.0], [23.4, 10.0], [23.5, 10.0], [23.6, 10.0], [23.7, 10.0], [23.8, 10.0], [23.9, 10.0], [24.0, 10.0], [24.1, 10.0], [24.2, 10.0], [24.3, 10.0], [24.4, 10.0], [24.5, 10.0], [24.6, 10.0], [24.7, 10.0], [24.8, 10.0], [24.9, 10.0], [25.0, 10.0], [25.1, 10.0], [25.2, 10.0], [25.3, 10.0], [25.4, 10.0], [25.5, 10.0], [25.6, 10.0], [25.7, 10.0], [25.8, 10.0], [25.9, 10.0], [26.0, 10.0], [26.1, 10.0], [26.2, 10.0], [26.3, 10.0], [26.4, 10.0], [26.5, 10.0], [26.6, 10.0], [26.7, 10.0], [26.8, 10.0], [26.9, 10.0], [27.0, 10.0], [27.1, 10.0], [27.2, 10.0], [27.3, 10.0], [27.4, 10.0], [27.5, 10.0], [27.6, 10.0], [27.7, 10.0], [27.8, 10.0], [27.9, 10.0], [28.0, 10.0], [28.1, 10.0], [28.2, 10.0], [28.3, 10.0], [28.4, 10.0], [28.5, 10.0], [28.6, 10.0], [28.7, 10.0], [28.8, 10.0], [28.9, 10.0], [29.0, 10.0], [29.1, 10.0], [29.2, 10.0], [29.3, 10.0], [29.4, 10.0], [29.5, 10.0], [29.6, 10.0], [29.7, 10.0], [29.8, 10.0], [29.9, 10.0], [30.0, 11.0], [30.1, 11.0], [30.2, 11.0], [30.3, 11.0], [30.4, 11.0], [30.5, 11.0], [30.6, 11.0], [30.7, 11.0], [30.8, 11.0], [30.9, 11.0], [31.0, 11.0], [31.1, 11.0], [31.2, 11.0], [31.3, 11.0], [31.4, 11.0], [31.5, 11.0], [31.6, 11.0], [31.7, 11.0], [31.8, 11.0], [31.9, 11.0], [32.0, 11.0], [32.1, 11.0], [32.2, 11.0], [32.3, 11.0], [32.4, 11.0], [32.5, 11.0], [32.6, 11.0], [32.7, 11.0], [32.8, 11.0], [32.9, 11.0], [33.0, 11.0], [33.1, 11.0], [33.2, 11.0], [33.3, 11.0], [33.4, 11.0], [33.5, 11.0], [33.6, 11.0], [33.7, 11.0], [33.8, 11.0], [33.9, 11.0], [34.0, 11.0], [34.1, 11.0], [34.2, 11.0], [34.3, 11.0], [34.4, 11.0], [34.5, 11.0], [34.6, 11.0], [34.7, 11.0], [34.8, 11.0], [34.9, 11.0], [35.0, 11.0], [35.1, 11.0], [35.2, 11.0], [35.3, 11.0], [35.4, 11.0], [35.5, 11.0], [35.6, 11.0], [35.7, 11.0], [35.8, 11.0], [35.9, 11.0], [36.0, 11.0], [36.1, 11.0], [36.2, 11.0], [36.3, 11.0], [36.4, 11.0], [36.5, 11.0], [36.6, 11.0], [36.7, 11.0], [36.8, 11.0], [36.9, 11.0], [37.0, 12.0], [37.1, 12.0], [37.2, 12.0], [37.3, 12.0], [37.4, 12.0], [37.5, 12.0], [37.6, 12.0], [37.7, 12.0], [37.8, 12.0], [37.9, 12.0], [38.0, 12.0], [38.1, 12.0], [38.2, 12.0], [38.3, 12.0], [38.4, 12.0], [38.5, 12.0], [38.6, 12.0], [38.7, 12.0], [38.8, 12.0], [38.9, 12.0], [39.0, 12.0], [39.1, 12.0], [39.2, 12.0], [39.3, 12.0], [39.4, 12.0], [39.5, 12.0], [39.6, 12.0], [39.7, 12.0], [39.8, 12.0], [39.9, 12.0], [40.0, 12.0], [40.1, 12.0], [40.2, 12.0], [40.3, 12.0], [40.4, 12.0], [40.5, 12.0], [40.6, 12.0], [40.7, 12.0], [40.8, 12.0], [40.9, 12.0], [41.0, 12.0], [41.1, 12.0], [41.2, 12.0], [41.3, 12.0], [41.4, 12.0], [41.5, 12.0], [41.6, 12.0], [41.7, 12.0], [41.8, 12.0], [41.9, 12.0], [42.0, 12.0], [42.1, 12.0], [42.2, 12.0], [42.3, 12.0], [42.4, 12.0], [42.5, 12.0], [42.6, 12.0], [42.7, 12.0], [42.8, 12.0], [42.9, 12.0], [43.0, 12.0], [43.1, 12.0], [43.2, 12.0], [43.3, 12.0], [43.4, 13.0], [43.5, 13.0], [43.6, 13.0], [43.7, 13.0], [43.8, 13.0], [43.9, 13.0], [44.0, 13.0], [44.1, 13.0], [44.2, 13.0], [44.3, 13.0], [44.4, 13.0], [44.5, 13.0], [44.6, 13.0], [44.7, 13.0], [44.8, 13.0], [44.9, 13.0], [45.0, 13.0], [45.1, 13.0], [45.2, 13.0], [45.3, 13.0], [45.4, 13.0], [45.5, 13.0], [45.6, 13.0], [45.7, 13.0], [45.8, 13.0], [45.9, 13.0], [46.0, 13.0], [46.1, 13.0], [46.2, 13.0], [46.3, 13.0], [46.4, 13.0], [46.5, 13.0], [46.6, 13.0], [46.7, 13.0], [46.8, 13.0], [46.9, 13.0], [47.0, 13.0], [47.1, 13.0], [47.2, 13.0], [47.3, 13.0], [47.4, 13.0], [47.5, 13.0], [47.6, 13.0], [47.7, 13.0], [47.8, 13.0], [47.9, 13.0], [48.0, 13.0], [48.1, 13.0], [48.2, 13.0], [48.3, 13.0], [48.4, 13.0], [48.5, 13.0], [48.6, 13.0], [48.7, 13.0], [48.8, 13.0], [48.9, 13.0], [49.0, 13.0], [49.1, 14.0], [49.2, 14.0], [49.3, 14.0], [49.4, 14.0], [49.5, 14.0], [49.6, 14.0], [49.7, 14.0], [49.8, 14.0], [49.9, 14.0], [50.0, 14.0], [50.1, 14.0], [50.2, 14.0], [50.3, 14.0], [50.4, 14.0], [50.5, 14.0], [50.6, 14.0], [50.7, 14.0], [50.8, 14.0], [50.9, 14.0], [51.0, 14.0], [51.1, 14.0], [51.2, 14.0], [51.3, 14.0], [51.4, 14.0], [51.5, 14.0], [51.6, 14.0], [51.7, 14.0], [51.8, 14.0], [51.9, 14.0], [52.0, 14.0], [52.1, 14.0], [52.2, 14.0], [52.3, 14.0], [52.4, 14.0], [52.5, 14.0], [52.6, 14.0], [52.7, 14.0], [52.8, 14.0], [52.9, 14.0], [53.0, 14.0], [53.1, 14.0], [53.2, 14.0], [53.3, 14.0], [53.4, 14.0], [53.5, 14.0], [53.6, 14.0], [53.7, 14.0], [53.8, 14.0], [53.9, 14.0], [54.0, 15.0], [54.1, 15.0], [54.2, 15.0], [54.3, 15.0], [54.4, 15.0], [54.5, 15.0], [54.6, 15.0], [54.7, 15.0], [54.8, 15.0], [54.9, 15.0], [55.0, 15.0], [55.1, 15.0], [55.2, 15.0], [55.3, 15.0], [55.4, 15.0], [55.5, 15.0], [55.6, 15.0], [55.7, 15.0], [55.8, 15.0], [55.9, 15.0], [56.0, 15.0], [56.1, 15.0], [56.2, 15.0], [56.3, 15.0], [56.4, 15.0], [56.5, 15.0], [56.6, 15.0], [56.7, 15.0], [56.8, 15.0], [56.9, 15.0], [57.0, 15.0], [57.1, 15.0], [57.2, 15.0], [57.3, 15.0], [57.4, 15.0], [57.5, 15.0], [57.6, 15.0], [57.7, 15.0], [57.8, 15.0], [57.9, 15.0], [58.0, 15.0], [58.1, 15.0], [58.2, 15.0], [58.3, 16.0], [58.4, 16.0], [58.5, 16.0], [58.6, 16.0], [58.7, 16.0], [58.8, 16.0], [58.9, 16.0], [59.0, 16.0], [59.1, 16.0], [59.2, 16.0], [59.3, 16.0], [59.4, 16.0], [59.5, 16.0], [59.6, 16.0], [59.7, 16.0], [59.8, 16.0], [59.9, 16.0], [60.0, 16.0], [60.1, 16.0], [60.2, 16.0], [60.3, 16.0], [60.4, 16.0], [60.5, 16.0], [60.6, 16.0], [60.7, 16.0], [60.8, 16.0], [60.9, 16.0], [61.0, 16.0], [61.1, 16.0], [61.2, 16.0], [61.3, 16.0], [61.4, 16.0], [61.5, 16.0], [61.6, 16.0], [61.7, 16.0], [61.8, 16.0], [61.9, 16.0], [62.0, 17.0], [62.1, 17.0], [62.2, 17.0], [62.3, 17.0], [62.4, 17.0], [62.5, 17.0], [62.6, 17.0], [62.7, 17.0], [62.8, 17.0], [62.9, 17.0], [63.0, 17.0], [63.1, 17.0], [63.2, 17.0], [63.3, 17.0], [63.4, 17.0], [63.5, 17.0], [63.6, 17.0], [63.7, 17.0], [63.8, 17.0], [63.9, 17.0], [64.0, 17.0], [64.1, 17.0], [64.2, 17.0], [64.3, 17.0], [64.4, 17.0], [64.5, 17.0], [64.6, 17.0], [64.7, 17.0], [64.8, 17.0], [64.9, 17.0], [65.0, 17.0], [65.1, 18.0], [65.2, 18.0], [65.3, 18.0], [65.4, 18.0], [65.5, 18.0], [65.6, 18.0], [65.7, 18.0], [65.8, 18.0], [65.9, 18.0], [66.0, 18.0], [66.1, 18.0], [66.2, 18.0], [66.3, 18.0], [66.4, 18.0], [66.5, 18.0], [66.6, 18.0], [66.7, 18.0], [66.8, 18.0], [66.9, 18.0], [67.0, 18.0], [67.1, 18.0], [67.2, 18.0], [67.3, 18.0], [67.4, 18.0], [67.5, 18.0], [67.6, 18.0], [67.7, 18.0], [67.8, 18.0], [67.9, 19.0], [68.0, 19.0], [68.1, 19.0], [68.2, 19.0], [68.3, 19.0], [68.4, 19.0], [68.5, 19.0], [68.6, 19.0], [68.7, 19.0], [68.8, 19.0], [68.9, 19.0], [69.0, 19.0], [69.1, 19.0], [69.2, 19.0], [69.3, 19.0], [69.4, 19.0], [69.5, 19.0], [69.6, 19.0], [69.7, 19.0], [69.8, 19.0], [69.9, 19.0], [70.0, 19.0], [70.1, 19.0], [70.2, 20.0], [70.3, 20.0], [70.4, 20.0], [70.5, 20.0], [70.6, 20.0], [70.7, 20.0], [70.8, 20.0], [70.9, 20.0], [71.0, 20.0], [71.1, 20.0], [71.2, 20.0], [71.3, 20.0], [71.4, 20.0], [71.5, 20.0], [71.6, 20.0], [71.7, 20.0], [71.8, 20.0], [71.9, 20.0], [72.0, 20.0], [72.1, 20.0], [72.2, 21.0], [72.3, 21.0], [72.4, 21.0], [72.5, 21.0], [72.6, 21.0], [72.7, 21.0], [72.8, 21.0], [72.9, 21.0], [73.0, 21.0], [73.1, 21.0], [73.2, 21.0], [73.3, 21.0], [73.4, 21.0], [73.5, 21.0], [73.6, 21.0], [73.7, 21.0], [73.8, 21.0], [73.9, 22.0], [74.0, 22.0], [74.1, 22.0], [74.2, 22.0], [74.3, 22.0], [74.4, 22.0], [74.5, 22.0], [74.6, 22.0], [74.7, 22.0], [74.8, 22.0], [74.9, 22.0], [75.0, 22.0], [75.1, 22.0], [75.2, 22.0], [75.3, 22.0], [75.4, 23.0], [75.5, 23.0], [75.6, 23.0], [75.7, 23.0], [75.8, 23.0], [75.9, 23.0], [76.0, 23.0], [76.1, 23.0], [76.2, 23.0], [76.3, 23.0], [76.4, 23.0], [76.5, 23.0], [76.6, 23.0], [76.7, 24.0], [76.8, 24.0], [76.9, 24.0], [77.0, 24.0], [77.1, 24.0], [77.2, 24.0], [77.3, 24.0], [77.4, 24.0], [77.5, 24.0], [77.6, 24.0], [77.7, 24.0], [77.8, 25.0], [77.9, 25.0], [78.0, 25.0], [78.1, 25.0], [78.2, 25.0], [78.3, 25.0], [78.4, 25.0], [78.5, 25.0], [78.6, 25.0], [78.7, 25.0], [78.8, 26.0], [78.9, 26.0], [79.0, 26.0], [79.1, 26.0], [79.2, 26.0], [79.3, 26.0], [79.4, 26.0], [79.5, 26.0], [79.6, 26.0], [79.7, 27.0], [79.8, 27.0], [79.9, 27.0], [80.0, 27.0], [80.1, 27.0], [80.2, 27.0], [80.3, 27.0], [80.4, 28.0], [80.5, 28.0], [80.6, 28.0], [80.7, 28.0], [80.8, 28.0], [80.9, 28.0], [81.0, 28.0], [81.1, 29.0], [81.2, 29.0], [81.3, 29.0], [81.4, 29.0], [81.5, 29.0], [81.6, 29.0], [81.7, 30.0], [81.8, 30.0], [81.9, 30.0], [82.0, 30.0], [82.1, 30.0], [82.2, 31.0], [82.3, 31.0], [82.4, 31.0], [82.5, 31.0], [82.6, 32.0], [82.7, 32.0], [82.8, 32.0], [82.9, 32.0], [83.0, 33.0], [83.1, 33.0], [83.2, 33.0], [83.3, 33.0], [83.4, 34.0], [83.5, 34.0], [83.6, 34.0], [83.7, 35.0], [83.8, 35.0], [83.9, 35.0], [84.0, 36.0], [84.1, 36.0], [84.2, 36.0], [84.3, 37.0], [84.4, 37.0], [84.5, 38.0], [84.6, 38.0], [84.7, 38.0], [84.8, 39.0], [84.9, 39.0], [85.0, 40.0], [85.1, 40.0], [85.2, 41.0], [85.3, 41.0], [85.4, 42.0], [85.5, 42.0], [85.6, 43.0], [85.7, 43.0], [85.8, 44.0], [85.9, 45.0], [86.0, 45.0], [86.1, 46.0], [86.2, 47.0], [86.3, 48.0], [86.4, 48.0], [86.5, 49.0], [86.6, 50.0], [86.7, 51.0], [86.8, 52.0], [86.9, 53.0], [87.0, 55.0], [87.1, 56.0], [87.2, 57.0], [87.3, 58.0], [87.4, 59.0], [87.5, 60.0], [87.6, 61.0], [87.7, 62.0], [87.8, 62.0], [87.9, 63.0], [88.0, 64.0], [88.1, 65.0], [88.2, 66.0], [88.3, 67.0], [88.4, 68.0], [88.5, 70.0], [88.6, 71.0], [88.7, 72.0], [88.8, 74.0], [88.9, 75.0], [89.0, 77.0], [89.1, 78.0], [89.2, 80.0], [89.3, 82.0], [89.4, 83.0], [89.5, 85.0], [89.6, 87.0], [89.7, 89.0], [89.8, 91.0], [89.9, 93.0], [90.0, 95.0], [90.1, 97.0], [90.2, 99.0], [90.3, 102.0], [90.4, 104.0], [90.5, 107.0], [90.6, 111.0], [90.7, 114.0], [90.8, 119.0], [90.9, 124.0], [91.0, 130.0], [91.1, 136.0], [91.2, 144.0], [91.3, 154.0], [91.4, 166.0], [91.5, 181.0], [91.6, 202.0], [91.7, 223.0], [91.8, 267.0], [91.9, 306.0], [92.0, 369.0], [92.1, 442.0], [92.2, 510.0], [92.3, 579.0], [92.4, 647.0], [92.5, 716.0], [92.6, 804.0], [92.7, 915.0], [92.8, 1062.0], [92.9, 1234.0], [93.0, 1417.0], [93.1, 1603.0], [93.2, 1811.0], [93.3, 2034.0], [93.4, 2276.0], [93.5, 2586.0], [93.6, 2944.0], [93.7, 3250.0], [93.8, 3487.0], [93.9, 3672.0], [94.0, 3837.0], [94.1, 3988.0], [94.2, 4133.0], [94.3, 4273.0], [94.4, 4411.0], [94.5, 4543.0], [94.6, 4672.0], [94.7, 4791.0], [94.8, 4917.0], [94.9, 5035.0], [95.0, 5153.0], [95.1, 5266.0], [95.2, 5382.0], [95.3, 5506.0], [95.4, 5623.0], [95.5, 5743.0], [95.6, 5870.0], [95.7, 6005.0], [95.8, 6142.0], [95.9, 6285.0], [96.0, 6443.0], [96.1, 6599.0], [96.2, 6756.0], [96.3, 6927.0], [96.4, 7114.0], [96.5, 7303.0], [96.6, 7527.0], [96.7, 7798.0], [96.8, 8124.0], [96.9, 8537.0], [97.0, 8922.0], [97.1, 9251.0], [97.2, 9544.0], [97.3, 9785.0], [97.4, 9980.0], [97.5, 10131.0], [97.6, 10239.0], [97.7, 10331.0], [97.8, 10412.0], [97.9, 10479.0], [98.0, 10540.0], [98.1, 10596.0], [98.2, 10649.0], [98.3, 10700.0], [98.4, 10751.0], [98.5, 10800.0], [98.6, 10847.0], [98.7, 10895.0], [98.8, 10941.0], [98.9, 10990.0], [99.0, 11044.0], [99.1, 11100.0], [99.2, 11158.0], [99.3, 11223.0], [99.4, 11294.0], [99.5, 11375.0], [99.6, 11462.0], [99.7, 11571.0], [99.8, 11716.0], [99.9, 11995.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 1014032.0, "series": [{"data": [[0.0, 1014032.0], [100.0, 15519.0], [33300.0, 1.0], [38500.0, 1.0], [39300.0, 1.0], [200.0, 3307.0], [300.0, 1770.0], [400.0, 1583.0], [500.0, 1661.0], [600.0, 1600.0], [700.0, 1370.0], [800.0, 1023.0], [900.0, 837.0], [1000.0, 680.0], [1100.0, 646.0], [1200.0, 632.0], [1300.0, 632.0], [1400.0, 613.0], [1500.0, 592.0], [1600.0, 542.0], [1700.0, 539.0], [1800.0, 502.0], [1900.0, 499.0], [2000.0, 502.0], [2100.0, 459.0], [2200.0, 444.0], [2300.0, 377.0], [2400.0, 360.0], [2500.0, 337.0], [2600.0, 296.0], [2800.0, 341.0], [2700.0, 298.0], [2900.0, 327.0], [3000.0, 332.0], [3100.0, 399.0], [3200.0, 414.0], [3300.0, 461.0], [3400.0, 526.0], [3500.0, 609.0], [3700.0, 675.0], [3600.0, 630.0], [3800.0, 720.0], [3900.0, 771.0], [4000.0, 744.0], [4100.0, 797.0], [4300.0, 841.0], [4200.0, 785.0], [4600.0, 876.0], [4500.0, 893.0], [4400.0, 842.0], [4700.0, 937.0], [4800.0, 889.0], [4900.0, 968.0], [5000.0, 933.0], [5100.0, 955.0], [5300.0, 985.0], [5200.0, 1005.0], [5500.0, 963.0], [5400.0, 895.0], [5600.0, 923.0], [5800.0, 880.0], [5700.0, 891.0], [5900.0, 836.0], [6000.0, 816.0], [6100.0, 806.0], [6300.0, 722.0], [6200.0, 790.0], [6400.0, 669.0], [6500.0, 742.0], [6600.0, 710.0], [6700.0, 703.0], [6900.0, 613.0], [6800.0, 646.0], [7000.0, 618.0], [7100.0, 593.0], [7300.0, 536.0], [7400.0, 489.0], [7200.0, 583.0], [7500.0, 480.0], [7600.0, 398.0], [7800.0, 380.0], [7700.0, 381.0], [7900.0, 322.0], [8000.0, 327.0], [8100.0, 299.0], [8300.0, 280.0], [8200.0, 274.0], [8700.0, 285.0], [8600.0, 285.0], [8500.0, 267.0], [8400.0, 259.0], [9000.0, 327.0], [8900.0, 325.0], [8800.0, 312.0], [9200.0, 359.0], [9100.0, 359.0], [9700.0, 485.0], [9400.0, 416.0], [9500.0, 408.0], [9600.0, 464.0], [9300.0, 362.0], [9900.0, 625.0], [10200.0, 1131.0], [9800.0, 548.0], [10100.0, 969.0], [10000.0, 755.0], [10400.0, 1667.0], [10700.0, 2238.0], [10300.0, 1349.0], [10600.0, 2163.0], [10500.0, 1971.0], [10800.0, 2354.0], [11000.0, 2016.0], [11100.0, 1907.0], [11200.0, 1561.0], [10900.0, 2369.0], [11500.0, 972.0], [11700.0, 546.0], [11400.0, 1177.0], [11300.0, 1424.0], [11600.0, 739.0], [11900.0, 277.0], [12100.0, 144.0], [12200.0, 100.0], [12000.0, 178.0], [11800.0, 419.0], [12600.0, 45.0], [12700.0, 37.0], [12300.0, 64.0], [12500.0, 47.0], [12400.0, 52.0], [13100.0, 16.0], [13200.0, 14.0], [13300.0, 11.0], [12900.0, 32.0], [13000.0, 12.0], [12800.0, 17.0], [13800.0, 7.0], [13700.0, 9.0], [13400.0, 12.0], [13600.0, 10.0], [13500.0, 15.0], [14100.0, 17.0], [14300.0, 11.0], [14000.0, 7.0], [13900.0, 12.0], [14200.0, 11.0], [14800.0, 9.0], [14500.0, 7.0], [14700.0, 7.0], [14400.0, 11.0], [14600.0, 15.0], [15300.0, 6.0], [15000.0, 4.0], [14900.0, 4.0], [15100.0, 7.0], [15200.0, 2.0], [15700.0, 10.0], [15800.0, 7.0], [15600.0, 7.0], [15400.0, 9.0], [15500.0, 2.0], [16100.0, 8.0], [16000.0, 9.0], [16300.0, 7.0], [16200.0, 6.0], [15900.0, 6.0], [16400.0, 15.0], [17400.0, 4.0], [17000.0, 3.0], [16800.0, 6.0], [17200.0, 2.0], [16600.0, 14.0], [17600.0, 1.0], [17800.0, 3.0], [18800.0, 1.0], [31600.0, 1.0], [40000.0, 1.0], [39600.0, 1.0], [33500.0, 1.0], [16500.0, 8.0], [17300.0, 3.0], [16900.0, 5.0], [16700.0, 10.0], [17700.0, 1.0], [17900.0, 1.0], [17500.0, 1.0], [19700.0, 1.0], [25100.0, 1.0], [25300.0, 1.0], [30500.0, 1.0], [36200.0, 1.0], [37000.0, 1.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 40000.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 9164.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 980619.0, "series": [{"data": [[1.0, 9164.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 980619.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 56244.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 78049.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 41.29612499514172, "minX": 1.52583078E12, "maxY": 150.0, "series": [{"data": [[1.52583102E12, 150.0], [1.52583324E12, 150.0], [1.52583384E12, 150.0], [1.52583486E12, 150.0], [1.52583162E12, 150.0], [1.52583222E12, 150.0], [1.5258312E12, 150.0], [1.52583282E12, 150.0], [1.52583444E12, 150.0], [1.5258318E12, 150.0], [1.52583402E12, 150.0], [1.52583342E12, 150.0], [1.5258324E12, 150.0], [1.52583078E12, 41.29612499514172], [1.525833E12, 150.0], [1.5258336E12, 150.0], [1.52583462E12, 150.0], [1.52583138E12, 150.0], [1.52583228E12, 150.0], [1.5258345E12, 150.0], [1.5258339E12, 150.0], [1.52583288E12, 150.0], [1.52583126E12, 150.0], [1.52583408E12, 150.0], [1.52583186E12, 150.0], [1.52583348E12, 150.0], [1.52583084E12, 117.6018427759264], [1.52583246E12, 150.0], [1.52583144E12, 150.0], [1.52583306E12, 150.0], [1.52583468E12, 150.0], [1.52583204E12, 150.0], [1.52583426E12, 150.0], [1.52583366E12, 150.0], [1.52583264E12, 150.0], [1.52583132E12, 150.0], [1.52583354E12, 150.0], [1.52583294E12, 150.0], [1.52583192E12, 150.0], [1.52583252E12, 150.0], [1.52583474E12, 150.0], [1.52583414E12, 150.0], [1.5258309E12, 150.0], [1.52583312E12, 150.0], [1.5258315E12, 150.0], [1.52583432E12, 150.0], [1.5258321E12, 150.0], [1.52583372E12, 150.0], [1.5258333E12, 150.0], [1.52583108E12, 150.0], [1.5258327E12, 150.0], [1.52583168E12, 150.0], [1.52583492E12, 150.0], [1.52583198E12, 150.0], [1.5258348E12, 150.0], [1.5258342E12, 150.0], [1.52583096E12, 150.0], [1.52583258E12, 150.0], [1.52583156E12, 150.0], [1.52583378E12, 150.0], [1.52583318E12, 150.0], [1.52583216E12, 150.0], [1.52583276E12, 150.0], [1.52583498E12, 118.45070422535201], [1.52583336E12, 150.0], [1.52583114E12, 150.0], [1.52583438E12, 150.0], [1.52583174E12, 150.0], [1.52583456E12, 150.0], [1.52583396E12, 150.0], [1.52583234E12, 150.0]], "isOverall": false, "label": "Digisoria Customer", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52583498E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 14.864130434782606, "minX": 1.0, "maxY": 3567.0, "series": [{"data": [[2.0, 2143.0], [3.0, 255.12500000000003], [4.0, 51.86065573770492], [5.0, 44.08823529411764], [6.0, 64.33050847457628], [7.0, 21.504464285714278], [8.0, 37.6491935483871], [9.0, 31.35686274509804], [10.0, 17.93984962406015], [11.0, 14.864130434782606], [12.0, 22.286764705882362], [13.0, 23.655021834061127], [14.0, 24.0729411764706], [15.0, 30.551980198019802], [16.0, 22.493112947658396], [17.0, 19.26984126984127], [18.0, 28.895261845386532], [19.0, 34.72619047619048], [20.0, 27.551282051282048], [21.0, 38.411585365853654], [22.0, 28.508860759493686], [23.0, 20.3974025974026], [24.0, 22.49118387909318], [25.0, 34.27105263157897], [26.0, 48.63311688311689], [27.0, 35.719879518072304], [28.0, 34.509333333333316], [29.0, 29.018766756032147], [30.0, 37.43206521739132], [31.0, 51.743670886075954], [32.0, 39.9568733153639], [33.0, 40.92565947242207], [34.0, 32.392771084337355], [35.0, 62.797752808988776], [36.0, 27.971061093247574], [37.0, 45.435114503816784], [38.0, 53.795389048991396], [39.0, 42.44350282485879], [40.0, 63.37119113573403], [41.0, 50.93877551020405], [42.0, 57.35215053763443], [43.0, 39.64824120603015], [44.0, 32.523702031602696], [45.0, 63.27804878048782], [46.0, 79.01838235294119], [47.0, 60.91208791208792], [48.0, 57.81606217616583], [49.0, 39.30373831775701], [50.0, 70.9100529100529], [51.0, 65.9186991869919], [52.0, 78.3843843843844], [53.0, 64.00390624999997], [54.0, 58.873456790123456], [55.0, 91.56965944272447], [56.0, 61.95511221945134], [57.0, 28.289411764705886], [58.0, 82.85487528344672], [59.0, 47.71645569620255], [60.0, 72.02840909090907], [61.0, 65.27864583333333], [62.0, 102.01020408163268], [63.0, 82.68900804289544], [64.0, 78.67303102625306], [65.0, 39.78431372549018], [66.0, 76.29255319148933], [67.0, 58.13207547169811], [68.0, 63.86802030456841], [69.0, 52.050438596491205], [70.0, 120.03197674418607], [71.0, 92.88148148148147], [72.0, 126.20956719817765], [73.0, 40.4110275689223], [74.0, 83.18387909319898], [75.0, 54.1174698795181], [76.0, 81.41475826972011], [77.0, 126.03943661971842], [78.0, 98.39637305699488], [79.0, 103.53698630136991], [80.0, 83.00240384615381], [81.0, 56.6265664160401], [82.0, 92.4878048780488], [83.0, 79.48484848484843], [84.0, 133.6666666666666], [85.0, 107.81016042780749], [86.0, 37.07853403141359], [87.0, 95.4274406332454], [88.0, 99.23835616438346], [89.0, 72.29471032745587], [90.0, 171.65833333333325], [91.0, 93.45219638242905], [92.0, 98.61647727272728], [93.0, 63.79120879120884], [94.0, 110.841095890411], [95.0, 107.34516129032258], [96.0, 128.13483146067415], [97.0, 123.50257731958772], [98.0, 71.23697916666667], [99.0, 168.1956521739131], [100.0, 62.09814323607429], [101.0, 87.99090909090903], [102.0, 74.55000000000003], [103.0, 207.1637426900586], [104.0, 195.37558685446015], [105.0, 118.47569444444449], [106.0, 187.4021447721181], [107.0, 111.52551020408166], [108.0, 62.806763285024175], [109.0, 80.52790697674422], [110.0, 120.41133004926112], [111.0, 112.40732265446223], [112.0, 106.59120879120881], [113.0, 113.29323308270672], [114.0, 109.06377551020405], [115.0, 72.88988764044949], [116.0, 146.7010582010583], [117.0, 76.63496143958871], [118.0, 180.06963788300845], [119.0, 118.08223684210533], [120.0, 104.58354755784057], [121.0, 139.6165644171779], [122.0, 201.52941176470586], [123.0, 162.69642857142856], [124.0, 262.9497487437185], [125.0, 249.60843373493978], [126.0, 257.47410358565725], [127.0, 114.42471042471043], [128.0, 136.53074433656948], [129.0, 185.4985337243402], [130.0, 158.85276073619642], [131.0, 98.75616438356163], [132.0, 208.95013850415526], [133.0, 182.85579937304084], [134.0, 94.02215189873417], [135.0, 124.48967551622417], [136.0, 241.32291666666677], [137.0, 149.2087912087911], [138.0, 162.1158192090395], [139.0, 204.19646799116995], [140.0, 146.8190255220418], [141.0, 38.341269841269835], [142.0, 22.89460784313726], [143.0, 42.8595238095238], [144.0, 113.53185595567871], [145.0, 351.0440414507774], [146.0, 341.9313984168867], [147.0, 63.11337868480727], [148.0, 47.19010416666667], [149.0, 48.28990228013026], [150.0, 575.8961240469257], [1.0, 3567.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}, {"data": [[146.61978371568532, 553.1874988879861]], "isOverall": false, "label": "Digisoria Shopfront 132-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 150.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 2643.5333333333333, "minX": 1.52583078E12, "maxY": 5788868.383333334, "series": [{"data": [[1.52583102E12, 271005.86666666664], [1.52583324E12, 186732.18333333332], [1.52583384E12, 233970.63333333333], [1.52583486E12, 299361.88333333336], [1.52583162E12, 298245.11666666664], [1.52583222E12, 218474.71666666667], [1.5258312E12, 274229.1], [1.52583282E12, 191266.01666666666], [1.52583444E12, 2220633.566666667], [1.5258318E12, 183510.41666666666], [1.52583402E12, 210350.66666666666], [1.52583342E12, 280261.31666666665], [1.5258324E12, 255516.78333333333], [1.52583078E12, 4866569.383333334], [1.525833E12, 179731.56666666668], [1.5258336E12, 274972.43333333335], [1.52583462E12, 302201.93333333335], [1.52583138E12, 283497.56666666665], [1.52583228E12, 186353.95], [1.5258345E12, 1538543.5166666666], [1.5258339E12, 188228.7], [1.52583288E12, 189939.28333333333], [1.52583126E12, 307680.0833333333], [1.52583408E12, 190890.83333333334], [1.52583186E12, 157053.68333333332], [1.52583348E12, 304257.2], [1.52583084E12, 5788868.383333334], [1.52583246E12, 179174.36666666667], [1.52583144E12, 293331.2], [1.52583306E12, 190127.93333333332], [1.52583468E12, 288407.23333333334], [1.52583204E12, 212813.21666666667], [1.52583426E12, 2131830.25], [1.52583366E12, 230939.08333333334], [1.52583264E12, 211304.08333333334], [1.52583132E12, 308816.56666666665], [1.52583354E12, 306720.01666666666], [1.52583294E12, 220743.61666666667], [1.52583192E12, 184650.61666666667], [1.52583252E12, 188990.61666666667], [1.52583474E12, 301446.56666666665], [1.52583414E12, 239456.91666666666], [1.5258309E12, 307658.4166666667], [1.52583312E12, 207516.38333333333], [1.5258315E12, 285772.0833333333], [1.52583432E12, 2140252.75], [1.5258321E12, 209221.36666666667], [1.52583372E12, 208450.33333333334], [1.5258333E12, 224145.38333333333], [1.52583108E12, 307116.0833333333], [1.5258327E12, 263081.51666666666], [1.52583168E12, 181435.71666666667], [1.52583492E12, 284241.61666666664], [1.52583198E12, 181630.9], [1.5258348E12, 302949.8333333333], [1.5258342E12, 587875.2833333333], [1.52583096E12, 305959.9], [1.52583258E12, 249279.98333333334], [1.52583156E12, 303719.0], [1.52583378E12, 196366.05], [1.52583318E12, 194851.61666666667], [1.52583216E12, 184080.4], [1.52583276E12, 205059.41666666666], [1.52583498E12, 46278.3], [1.52583336E12, 219223.51666666666], [1.52583114E12, 246450.13333333333], [1.52583438E12, 1901555.8333333333], [1.52583174E12, 159509.0], [1.52583456E12, 299931.1], [1.52583396E12, 218476.13333333333], [1.52583234E12, 187291.38333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52583102E12, 18497.766666666666], [1.52583324E12, 12749.433333333332], [1.52583384E12, 15975.366666666667], [1.52583486E12, 20434.5], [1.52583162E12, 20359.8], [1.52583222E12, 14913.433333333332], [1.5258312E12, 18718.233333333334], [1.52583282E12, 13057.5], [1.52583444E12, 2757250.933333333], [1.5258318E12, 12523.166666666666], [1.52583402E12, 14364.266666666666], [1.52583342E12, 19135.333333333332], [1.5258324E12, 17442.8], [1.52583078E12, 331176.2], [1.525833E12, 12268.533333333333], [1.5258336E12, 18772.1], [1.52583462E12, 20630.3], [1.52583138E12, 19355.166666666668], [1.52583228E12, 12724.533333333333], [1.5258345E12, 1775360.8666666667], [1.5258339E12, 12847.233333333334], [1.52583288E12, 12969.2], [1.52583126E12, 21002.8], [1.52583408E12, 13030.633333333333], [1.52583186E12, 10719.6], [1.52583348E12, 20769.0], [1.52583084E12, 394157.23333333334], [1.52583246E12, 12230.333333333334], [1.52583144E12, 20024.666666666668], [1.52583306E12, 12976.5], [1.52583468E12, 19689.166666666668], [1.52583204E12, 14531.166666666666], [1.52583426E12, 2667844.8666666667], [1.52583366E12, 15767.933333333332], [1.52583264E12, 14426.1], [1.52583132E12, 21080.933333333334], [1.52583354E12, 20940.166666666668], [1.52583294E12, 15073.5], [1.52583192E12, 12604.1], [1.52583252E12, 12901.866666666667], [1.52583474E12, 20578.466666666667], [1.52583414E12, 16346.0], [1.5258309E12, 20999.566666666666], [1.52583312E12, 14168.9], [1.5258315E12, 19508.1], [1.52583432E12, 2647150.966666667], [1.5258321E12, 14280.266666666666], [1.52583372E12, 14230.733333333334], [1.5258333E12, 15306.266666666666], [1.52583108E12, 20965.366666666665], [1.5258327E12, 17961.966666666667], [1.52583168E12, 12383.366666666667], [1.52583492E12, 19405.933333333334], [1.52583198E12, 12401.266666666666], [1.5258348E12, 20679.533333333333], [1.5258342E12, 617184.3333333334], [1.52583096E12, 20885.066666666666], [1.52583258E12, 17018.733333333334], [1.52583156E12, 20726.566666666666], [1.52583378E12, 13407.5], [1.52583318E12, 13300.566666666668], [1.52583216E12, 12567.466666666667], [1.52583276E12, 14001.266666666666], [1.52583498E12, 2643.5333333333333], [1.52583336E12, 14969.4], [1.52583114E12, 16828.066666666666], [1.52583438E12, 2301400.7], [1.52583174E12, 10886.233333333334], [1.52583456E12, 20471.166666666668], [1.52583396E12, 14914.533333333333], [1.52583234E12, 12785.9]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52583498E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 40.85852539935499, "minX": 1.52583078E12, "maxY": 10888.062575210593, "series": [{"data": [[1.52583102E12, 6261.483263598327], [1.52583324E12, 8815.24089068826], [1.52583384E12, 7335.983844911153], [1.52583486E12, 5671.388888888889], [1.52583162E12, 5763.996197718624], [1.52583222E12, 7825.8486159169515], [1.5258312E12, 6314.463818056508], [1.52583282E12, 8855.412055335979], [1.52583444E12, 41.80524458505775], [1.5258318E12, 9229.487126673537], [1.52583402E12, 8085.308176100628], [1.52583342E12, 6252.068105192181], [1.5258324E12, 6668.531065088752], [1.52583078E12, 40.85852539935499], [1.525833E12, 9478.049421661404], [1.5258336E12, 6161.175257731952], [1.52583462E12, 5644.84490306442], [1.52583138E12, 5953.938666666665], [1.52583228E12, 9015.937119675467], [1.5258345E12, 62.43611306958195], [1.5258339E12, 8958.725903614462], [1.52583288E12, 8936.806965174119], [1.52583126E12, 5510.932432432425], [1.52583408E12, 8898.958415841571], [1.52583186E12, 10888.062575210593], [1.52583348E12, 5614.2149068322915], [1.52583084E12, 246.24890544337777], [1.52583246E12, 9412.285864978921], [1.52583144E12, 5828.808634020615], [1.52583306E12, 8970.544731610344], [1.52583468E12, 5919.724115334205], [1.52583204E12, 8085.0479573712355], [1.52583426E12, 43.33863946367964], [1.52583366E12, 7317.21276595744], [1.52583264E12, 8049.0357781753], [1.52583132E12, 5509.938800489597], [1.52583354E12, 5466.083179297595], [1.52583294E12, 7688.471746575346], [1.52583192E12, 9245.447287615149], [1.52583252E12, 9017.560000000001], [1.52583474E12, 5623.16426332288], [1.52583414E12, 7098.610891870565], [1.5258309E12, 5543.119164619159], [1.52583312E12, 8244.653916211286], [1.5258315E12, 5655.119708994707], [1.52583432E12, 43.806685288368136], [1.5258321E12, 8043.472448057814], [1.52583372E12, 8137.611967361733], [1.5258333E12, 7742.100337268137], [1.52583108E12, 5519.975384615389], [1.5258327E12, 6452.595545977012], [1.52583168E12, 9453.536458333332], [1.52583492E12, 5749.012632978721], [1.52583198E12, 9290.381893860584], [1.5258348E12, 5646.124142233316], [1.5258342E12, 199.91824530589912], [1.52583096E12, 5554.100679431753], [1.52583258E12, 6869.700530705066], [1.52583156E12, 5742.284380833848], [1.52583378E12, 8645.743984600575], [1.52583318E12, 8927.652764306515], [1.52583216E12, 9251.768993839827], [1.52583276E12, 8335.922580645176], [1.52583498E12, 5676.554929577463], [1.52583336E12, 7558.349137931035], [1.52583114E12, 6812.262269938656], [1.52583438E12, 50.264508315297455], [1.52583174E12, 10295.127962085293], [1.52583456E12, 5649.410207939509], [1.52583396E12, 7799.535467128033], [1.52583234E12, 9137.762865792123]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52583498E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 40.53531035018868, "minX": 1.52583078E12, "maxY": 10885.045728038505, "series": [{"data": [[1.52583102E12, 6260.54672245467], [1.52583324E12, 8813.43218623482], [1.52583384E12, 7335.436995153476], [1.52583486E12, 5670.335858585867], [1.52583162E12, 5763.257287705964], [1.52583222E12, 7825.020761245668], [1.5258312E12, 6313.042039972429], [1.52583282E12, 8854.077075098827], [1.52583444E12, 41.78901847726396], [1.5258318E12, 9228.36354273944], [1.52583402E12, 8084.704402515722], [1.52583342E12, 6251.097100472032], [1.5258324E12, 6668.029585798827], [1.52583078E12, 40.53531035018868], [1.525833E12, 9476.89379600421], [1.5258336E12, 6160.226116838495], [1.52583462E12, 5644.30769230769], [1.52583138E12, 5952.9066666666595], [1.52583228E12, 9014.665314401618], [1.5258345E12, 62.41273014050117], [1.5258339E12, 8957.695783132527], [1.52583288E12, 8935.745273631848], [1.52583126E12, 5509.4895577395555], [1.52583408E12, 8898.119801980194], [1.52583186E12, 10885.045728038505], [1.52583348E12, 5613.537267080749], [1.52583084E12, 245.95056524864324], [1.52583246E12, 9411.266877637141], [1.52583144E12, 5827.66945876289], [1.52583306E12, 8969.601391650094], [1.52583468E12, 5918.60288335517], [1.52583204E12, 8084.151865008873], [1.52583426E12, 43.32528465430427], [1.52583366E12, 7316.32569558101], [1.52583264E12, 8048.514311270125], [1.52583132E12, 5508.345777233781], [1.52583354E12, 5465.1441774491705], [1.52583294E12, 7687.481164383561], [1.52583192E12, 9244.501535312193], [1.52583252E12, 9016.645999999986], [1.52583474E12, 5621.4275862069035], [1.52583414E12, 7097.57379636938], [1.5258309E12, 5541.977886977889], [1.52583312E12, 8243.692167577412], [1.5258315E12, 5653.49735449735], [1.52583432E12, 43.79427407049977], [1.5258321E12, 8042.168925022581], [1.52583372E12, 8137.03354487761], [1.5258333E12, 7741.2723440135005], [1.52583108E12, 5518.670153846157], [1.5258327E12, 6451.195402298853], [1.52583168E12, 9452.513541666678], [1.52583492E12, 5748.0877659574435], [1.52583198E12, 9288.937565036418], [1.5258348E12, 5644.98378041173], [1.5258342E12, 199.89773345042656], [1.52583096E12, 5552.842495367504], [1.52583258E12, 6869.206974981043], [1.52583156E12, 5741.738643434973], [1.52583378E12, 8645.26179018287], [1.52583318E12, 8926.867119301649], [1.52583216E12, 9250.977412731012], [1.52583276E12, 8334.450691244234], [1.52583498E12, 4269.59154929577], [1.52583336E12, 7557.685344827587], [1.52583114E12, 6811.32131901841], [1.52583438E12, 50.249318739977674], [1.52583174E12, 10293.682464454974], [1.52583456E12, 5648.540012602392], [1.52583396E12, 7798.44896193772], [1.52583234E12, 9136.946518668003]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52583498E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 1.3721481596641945, "minX": 1.52583078E12, "maxY": 170.04895960832343, "series": [{"data": [[1.52583102E12, 71.47001394700133], [1.52583324E12, 59.114372469635676], [1.52583384E12, 65.94991922455588], [1.52583486E12, 83.34595959595954], [1.52583162E12, 55.124841571609636], [1.52583222E12, 47.1297577854672], [1.5258312E12, 66.10406616126814], [1.52583282E12, 56.26383399209482], [1.52583444E12, 2.0227081266263895], [1.5258318E12, 69.75592173017516], [1.52583402E12, 56.27583108715176], [1.52583342E12, 95.13351314902197], [1.5258324E12, 44.49334319526621], [1.52583078E12, 1.3721481596641945], [1.525833E12, 62.477392218717085], [1.5258336E12, 46.696219931271436], [1.52583462E12, 67.00687929956221], [1.52583138E12, 71.2666666666667], [1.52583228E12, 57.93914807302232], [1.5258345E12, 3.1963017611699454], [1.5258339E12, 62.6746987951807], [1.52583288E12, 61.67263681592039], [1.52583126E12, 73.48034398034402], [1.52583408E12, 73.35643564356432], [1.52583186E12, 82.03249097472928], [1.52583348E12, 69.4658385093168], [1.52583084E12, 4.380742338103648], [1.52583246E12, 56.96202531645568], [1.52583144E12, 70.81829896907212], [1.52583306E12, 66.90357852882697], [1.52583468E12, 74.29882044560938], [1.52583204E12, 57.150976909413835], [1.52583426E12, 1.7881756005068992], [1.52583366E12, 67.01800327332239], [1.52583264E12, 49.10644007155639], [1.52583132E12, 170.04895960832343], [1.52583354E12, 55.731977818853956], [1.52583294E12, 49.62243150684929], [1.52583192E12, 115.23848515864898], [1.52583252E12, 60.90299999999999], [1.52583474E12, 90.59811912225705], [1.52583414E12, 62.277821625887775], [1.5258309E12, 63.24201474201462], [1.52583312E12, 58.842440801457045], [1.5258315E12, 74.11507936507927], [1.52583432E12, 1.7546371449323919], [1.5258321E12, 61.87262872628729], [1.52583372E12, 68.74342701722571], [1.5258333E12, 54.32967959527825], [1.52583108E12, 69.64738461538464], [1.5258327E12, 43.60201149425286], [1.52583168E12, 80.1572916666667], [1.52583492E12, 81.12965425531921], [1.52583198E12, 63.08949011446416], [1.5258348E12, 79.7055520898316], [1.5258342E12, 2.2682432149876846], [1.52583096E12, 68.12909203211841], [1.52583258E12, 43.046247156937056], [1.52583156E12, 55.25886745488493], [1.52583378E12, 91.17709335899896], [1.52583318E12, 61.474296799224064], [1.52583216E12, 74.71560574948654], [1.52583276E12, 56.05990783410144], [1.52583498E12, 71.78028169014082], [1.52583336E12, 56.49396551724145], [1.52583114E12, 66.52684049079754], [1.52583438E12, 2.7367700985723946], [1.52583174E12, 81.8424170616113], [1.52583456E12, 75.2665406427222], [1.52583396E12, 50.27595155709336], [1.52583234E12, 59.44500504540868]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52583498E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 4.0, "minX": 1.52583078E12, "maxY": 40020.0, "series": [{"data": [[1.52583102E12, 10243.0], [1.52583324E12, 12411.0], [1.52583384E12, 13142.0], [1.52583486E12, 10429.0], [1.52583162E12, 13312.0], [1.52583222E12, 13582.0], [1.5258312E12, 11235.0], [1.52583282E12, 39665.0], [1.52583444E12, 6513.0], [1.5258318E12, 14302.0], [1.52583402E12, 12194.0], [1.52583342E12, 17314.0], [1.5258324E12, 12871.0], [1.52583078E12, 2805.0], [1.525833E12, 12805.0], [1.5258336E12, 25357.0], [1.52583462E12, 11837.0], [1.52583138E12, 13597.0], [1.52583228E12, 12607.0], [1.5258345E12, 8520.0], [1.5258339E12, 11961.0], [1.52583288E12, 12470.0], [1.52583126E12, 7915.0], [1.52583408E12, 12778.0], [1.52583186E12, 12728.0], [1.52583348E12, 38546.0], [1.52583084E12, 9733.0], [1.52583246E12, 12966.0], [1.52583144E12, 10716.0], [1.52583306E12, 12706.0], [1.52583468E12, 36218.0], [1.52583204E12, 12588.0], [1.52583426E12, 9678.0], [1.52583366E12, 12329.0], [1.52583264E12, 12396.0], [1.52583132E12, 9274.0], [1.52583354E12, 39325.0], [1.52583294E12, 13303.0], [1.52583192E12, 40020.0], [1.52583252E12, 12380.0], [1.52583474E12, 37057.0], [1.52583414E12, 14175.0], [1.5258309E12, 12629.0], [1.52583312E12, 14115.0], [1.5258315E12, 9672.0], [1.52583432E12, 8099.0], [1.5258321E12, 12346.0], [1.52583372E12, 12499.0], [1.5258333E12, 15684.0], [1.52583108E12, 7856.0], [1.5258327E12, 31651.0], [1.52583168E12, 15842.0], [1.52583492E12, 9039.0], [1.52583198E12, 13080.0], [1.5258348E12, 7949.0], [1.5258342E12, 12472.0], [1.52583096E12, 13289.0], [1.52583258E12, 13594.0], [1.52583156E12, 25191.0], [1.52583378E12, 12357.0], [1.52583318E12, 12529.0], [1.52583216E12, 12194.0], [1.52583276E12, 12587.0], [1.52583498E12, 11601.0], [1.52583336E12, 12079.0], [1.52583114E12, 19775.0], [1.52583438E12, 6679.0], [1.52583174E12, 15731.0], [1.52583456E12, 9138.0], [1.52583396E12, 14306.0], [1.52583234E12, 14184.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52583102E12, 3912.0], [1.52583324E12, 300.0], [1.52583384E12, 259.0], [1.52583486E12, 2726.0], [1.52583162E12, 292.0], [1.52583222E12, 233.0], [1.5258312E12, 1894.0], [1.52583282E12, 268.0], [1.52583444E12, 985.0], [1.5258318E12, 343.0], [1.52583402E12, 276.0], [1.52583342E12, 337.0], [1.5258324E12, 253.0], [1.52583078E12, 4.0], [1.525833E12, 384.0], [1.5258336E12, 260.0], [1.52583462E12, 2154.0], [1.52583138E12, 2847.0], [1.52583228E12, 261.0], [1.5258345E12, 769.0], [1.5258339E12, 284.0], [1.52583288E12, 284.0], [1.52583126E12, 3816.0], [1.52583408E12, 305.0], [1.52583186E12, 8570.0], [1.52583348E12, 1096.0], [1.52583084E12, 4.0], [1.52583246E12, 350.0], [1.52583144E12, 2054.0], [1.52583306E12, 345.0], [1.52583468E12, 2780.0], [1.52583204E12, 275.0], [1.52583426E12, 370.0], [1.52583366E12, 339.0], [1.52583264E12, 273.0], [1.52583132E12, 1666.0], [1.52583354E12, 601.0], [1.52583294E12, 279.0], [1.52583192E12, 292.0], [1.52583252E12, 327.0], [1.52583474E12, 1211.0], [1.52583414E12, 259.0], [1.5258309E12, 4040.0], [1.52583312E12, 281.0], [1.5258315E12, 2228.0], [1.52583432E12, 303.0], [1.5258321E12, 274.0], [1.52583372E12, 273.0], [1.5258333E12, 246.0], [1.52583108E12, 3762.0], [1.5258327E12, 358.0], [1.52583168E12, 373.0], [1.52583492E12, 3053.0], [1.52583198E12, 340.0], [1.5258348E12, 3956.0], [1.5258342E12, 286.0], [1.52583096E12, 3584.0], [1.52583258E12, 240.0], [1.52583156E12, 554.0], [1.52583378E12, 260.0], [1.52583318E12, 410.0], [1.52583216E12, 314.0], [1.52583276E12, 273.0], [1.52583498E12, 3468.0], [1.52583336E12, 321.0], [1.52583114E12, 3261.0], [1.52583438E12, 722.0], [1.52583174E12, 5032.0], [1.52583456E12, 2562.0], [1.52583396E12, 236.0], [1.52583234E12, 363.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52583102E12, 5928.9000000000015], [1.52583324E12, 11473.0], [1.52583384E12, 11386.0], [1.52583486E12, 8696.0], [1.52583162E12, 8903.0], [1.52583222E12, 11171.0], [1.5258312E12, 6611.9000000000015], [1.52583282E12, 11427.0], [1.52583444E12, 11210.900000000001], [1.5258318E12, 10583.0], [1.52583402E12, 11360.0], [1.52583342E12, 11468.900000000001], [1.5258324E12, 11311.0], [1.52583078E12, 17.0], [1.525833E12, 11442.900000000001], [1.5258336E12, 11370.0], [1.52583462E12, 11089.0], [1.52583138E12, 7016.0], [1.52583228E12, 11210.0], [1.5258345E12, 11210.0], [1.5258339E12, 11370.0], [1.52583288E12, 11436.0], [1.52583126E12, 6682.0], [1.52583408E12, 11368.900000000001], [1.52583186E12, 10772.800000000003], [1.52583348E12, 11439.0], [1.52583084E12, 32.0], [1.52583246E12, 11334.900000000001], [1.52583144E12, 7256.0], [1.52583306E12, 11448.0], [1.52583468E12, 11005.0], [1.52583204E12, 11043.0], [1.52583426E12, 11251.0], [1.52583366E12, 11364.0], [1.52583264E12, 11412.0], [1.52583132E12, 6848.0], [1.52583354E12, 11378.900000000001], [1.52583294E12, 11439.0], [1.52583192E12, 10891.900000000001], [1.52583252E12, 11375.0], [1.52583474E12, 10882.0], [1.52583414E12, 11369.0], [1.5258309E12, 4945.0], [1.52583312E12, 11453.0], [1.5258315E12, 7402.0], [1.52583432E12, 11212.0], [1.5258321E12, 11054.0], [1.52583372E12, 11395.900000000001], [1.5258333E12, 11503.0], [1.52583108E12, 6067.9000000000015], [1.5258327E12, 11412.0], [1.52583168E12, 9675.900000000001], [1.52583492E12, 7698.700000000004], [1.52583198E12, 10957.0], [1.5258348E12, 10683.0], [1.5258342E12, 11375.0], [1.52583096E12, 5518.0], [1.52583258E12, 11410.0], [1.52583156E12, 7903.9000000000015], [1.52583378E12, 11396.0], [1.52583318E12, 11463.0], [1.52583216E12, 11113.900000000001], [1.52583276E12, 11429.0], [1.52583498E12, 7692.0], [1.52583336E12, 11497.900000000001], [1.52583114E12, 6367.9000000000015], [1.52583438E12, 11211.0], [1.52583174E12, 10317.0], [1.52583456E12, 11174.900000000001], [1.52583396E12, 11377.900000000001], [1.52583234E12, 11275.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52583102E12, 8032.980000000003], [1.52583324E12, 12140.990000000002], [1.52583384E12, 13566.81000000003], [1.52583486E12, 11515.930000000011], [1.52583162E12, 11737.840000000026], [1.52583222E12, 11991.960000000006], [1.5258312E12, 9665.900000000016], [1.52583282E12, 12056.990000000002], [1.52583444E12, 12456.900000000016], [1.5258318E12, 12029.920000000013], [1.52583402E12, 13617.63000000006], [1.52583342E12, 12458.970000000005], [1.5258324E12, 12076.0], [1.52583078E12, 1511.9900000000016], [1.525833E12, 12070.980000000003], [1.5258336E12, 13617.63000000006], [1.52583462E12, 11882.0], [1.52583138E12, 9854.680000000051], [1.52583228E12, 12031.980000000003], [1.5258345E12, 12446.820000000029], [1.5258339E12, 13566.81000000003], [1.52583288E12, 12068.0], [1.52583126E12, 9665.900000000016], [1.52583408E12, 13617.63000000006], [1.52583186E12, 12071.970000000005], [1.52583348E12, 12441.990000000002], [1.52583084E12, 5668.990000000002], [1.52583246E12, 12114.0], [1.52583144E12, 9987.850000000024], [1.52583306E12, 12072.990000000002], [1.52583468E12, 11853.990000000002], [1.52583204E12, 12326.920000000013], [1.52583426E12, 12585.0], [1.52583366E12, 13581.0], [1.52583264E12, 12040.980000000003], [1.52583132E12, 9665.900000000016], [1.52583354E12, 12420.920000000013], [1.52583294E12, 12092.980000000003], [1.52583192E12, 12277.910000000014], [1.52583252E12, 12125.990000000002], [1.52583474E12, 11828.990000000002], [1.52583414E12, 13617.63000000006], [1.5258309E12, 6310.990000000002], [1.52583312E12, 12126.980000000003], [1.5258315E12, 9987.850000000024], [1.52583432E12, 12469.980000000003], [1.5258321E12, 11903.0], [1.52583372E12, 13580.860000000022], [1.5258333E12, 12399.980000000003], [1.52583108E12, 8032.980000000003], [1.5258327E12, 12040.980000000003], [1.52583168E12, 11967.980000000003], [1.52583492E12, 11213.990000000002], [1.52583198E12, 12280.970000000005], [1.5258348E12, 11688.970000000005], [1.5258342E12, 13617.63000000006], [1.52583096E12, 6727.990000000002], [1.52583258E12, 12183.94000000001], [1.52583156E12, 11555.840000000026], [1.52583378E12, 13580.860000000022], [1.52583318E12, 12133.0], [1.52583216E12, 11920.930000000011], [1.52583276E12, 12059.0], [1.52583498E12, 11205.980000000003], [1.52583336E12, 12395.990000000002], [1.52583114E12, 9523.970000000005], [1.52583438E12, 12467.890000000018], [1.52583174E12, 12000.930000000011], [1.52583456E12, 11955.0], [1.52583396E12, 13617.63000000006], [1.52583234E12, 12047.990000000002]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52583102E12, 6450.950000000001], [1.52583324E12, 11693.0], [1.52583384E12, 11709.95], [1.52583486E12, 10859.95], [1.52583162E12, 9957.850000000002], [1.52583222E12, 11443.0], [1.5258312E12, 7461.0], [1.52583282E12, 11632.95], [1.52583444E12, 11497.0], [1.5258318E12, 10994.95], [1.52583402E12, 11664.0], [1.52583342E12, 11719.95], [1.5258324E12, 11557.95], [1.52583078E12, 27.0], [1.525833E12, 11647.0], [1.5258336E12, 11685.95], [1.52583462E12, 11379.0], [1.52583138E12, 7775.0], [1.52583228E12, 11480.95], [1.5258345E12, 11496.95], [1.5258339E12, 11682.0], [1.52583288E12, 11644.0], [1.52583126E12, 7463.950000000001], [1.52583408E12, 11685.95], [1.52583186E12, 11123.0], [1.52583348E12, 11700.95], [1.52583084E12, 4006.7000000000044], [1.52583246E12, 11573.0], [1.52583144E12, 8070.950000000001], [1.52583306E12, 11657.0], [1.52583468E12, 11331.95], [1.52583204E12, 11356.0], [1.52583426E12, 11536.0], [1.52583366E12, 11691.0], [1.52583264E12, 11620.0], [1.52583132E12, 7582.950000000001], [1.52583354E12, 11655.0], [1.52583294E12, 11649.95], [1.52583192E12, 11220.0], [1.52583252E12, 11608.0], [1.52583474E12, 11259.0], [1.52583414E12, 11680.0], [1.5258309E12, 5612.950000000001], [1.52583312E12, 11668.95], [1.5258315E12, 8124.950000000001], [1.52583432E12, 11499.0], [1.5258321E12, 11345.95], [1.52583372E12, 11724.95], [1.5258333E12, 11742.900000000001], [1.52583108E12, 6529.0], [1.5258327E12, 11619.95], [1.52583168E12, 10612.95], [1.52583492E12, 8662.850000000002], [1.52583198E12, 11265.95], [1.5258348E12, 11112.0], [1.5258342E12, 11673.95], [1.52583096E12, 6068.950000000001], [1.52583258E12, 11631.0], [1.52583156E12, 9184.900000000001], [1.52583378E12, 11713.95], [1.52583318E12, 11680.0], [1.52583216E12, 11388.95], [1.52583276E12, 11633.95], [1.52583498E12, 8610.750000000004], [1.52583336E12, 11736.0], [1.52583114E12, 6983.9000000000015], [1.52583438E12, 11497.95], [1.52583174E12, 10871.0], [1.52583456E12, 11441.95], [1.52583396E12, 11694.95], [1.52583234E12, 11527.95]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52583498E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 10.0, "minX": 5.0, "maxY": 10864.0, "series": [{"data": [[2292.0, 3359.0], [2972.0, 3189.0], [797.0, 10830.0], [13.0, 10864.0], [3445.0, 4902.0], [3418.0, 3683.0], [3561.0, 3074.0], [14.0, 10694.0], [15.0, 10728.0], [16.0, 10645.0], [17.0, 10667.0], [18.0, 10510.0], [19.0, 10398.5], [20.0, 10324.5], [5.0, 7593.0], [21.0, 7356.5], [22.0, 10383.5], [23.0, 6240.5], [24.0, 6130.0], [25.0, 6234.0], [428.0, 10.0], [26.0, 5609.0], [27.0, 5513.0], [510.0, 12.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2292.0, 12.0], [5.0, 3262.0], [2972.0, 12.0], [797.0, 14.0], [3445.0, 13.0], [3418.0, 12.0], [3561.0, 14.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 3561.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 5.0, "maxY": 10861.0, "series": [{"data": [[2292.0, 3358.0], [2972.0, 3188.0], [797.0, 10828.0], [13.0, 10861.0], [3445.0, 4902.0], [3418.0, 3683.0], [3561.0, 3074.0], [14.0, 10693.0], [15.0, 10722.0], [16.0, 10644.0], [17.0, 10667.0], [18.0, 10509.0], [19.0, 10397.5], [20.0, 10324.0], [5.0, 7593.0], [21.0, 7356.5], [22.0, 10383.5], [23.0, 6238.0], [24.0, 6129.0], [25.0, 6233.5], [428.0, 9.0], [26.0, 5607.0], [27.0, 5513.0], [510.0, 12.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[2292.0, 12.0], [5.0, 0.0], [2972.0, 12.0], [797.0, 14.0], [3445.0, 13.0], [3418.0, 12.0], [3561.0, 14.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 3561.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.4166666666666665, "minX": 1.52583078E12, "maxY": 3561.15, "series": [{"data": [[1.52583102E12, 23.9], [1.52583324E12, 16.466666666666665], [1.52583384E12, 20.633333333333333], [1.52583486E12, 26.4], [1.52583162E12, 26.3], [1.52583222E12, 19.25], [1.5258312E12, 24.183333333333334], [1.52583282E12, 16.866666666666667], [1.52583444E12, 3561.15], [1.5258318E12, 16.183333333333334], [1.52583402E12, 18.55], [1.52583342E12, 24.716666666666665], [1.5258324E12, 22.533333333333335], [1.52583078E12, 430.05], [1.525833E12, 15.85], [1.5258336E12, 24.25], [1.52583462E12, 26.65], [1.52583138E12, 25.0], [1.52583228E12, 16.45], [1.5258345E12, 2292.983333333333], [1.5258339E12, 16.6], [1.52583288E12, 16.75], [1.52583126E12, 27.133333333333333], [1.52583408E12, 16.833333333333332], [1.52583186E12, 13.85], [1.52583348E12, 26.833333333333332], [1.52583084E12, 511.3666666666667], [1.52583246E12, 15.8], [1.52583144E12, 25.85], [1.52583306E12, 16.766666666666666], [1.52583468E12, 25.433333333333334], [1.52583204E12, 18.766666666666666], [1.52583426E12, 3445.6833333333334], [1.52583366E12, 20.366666666666667], [1.52583264E12, 18.633333333333333], [1.52583132E12, 27.233333333333334], [1.52583354E12, 27.05], [1.52583294E12, 19.466666666666665], [1.52583192E12, 16.283333333333335], [1.52583252E12, 16.666666666666668], [1.52583474E12, 26.583333333333332], [1.52583414E12, 21.116666666666667], [1.5258309E12, 27.133333333333333], [1.52583312E12, 18.3], [1.5258315E12, 25.216666666666665], [1.52583432E12, 3418.9666666666667], [1.5258321E12, 18.45], [1.52583372E12, 18.383333333333333], [1.5258333E12, 19.766666666666666], [1.52583108E12, 27.083333333333332], [1.5258327E12, 23.2], [1.52583168E12, 15.983333333333333], [1.52583492E12, 25.066666666666666], [1.52583198E12, 16.016666666666666], [1.5258348E12, 26.716666666666665], [1.5258342E12, 797.1], [1.52583096E12, 26.983333333333334], [1.52583258E12, 21.983333333333334], [1.52583156E12, 26.783333333333335], [1.52583378E12, 17.316666666666666], [1.52583318E12, 17.183333333333334], [1.52583216E12, 16.233333333333334], [1.52583276E12, 18.083333333333332], [1.52583498E12, 3.4166666666666665], [1.52583336E12, 19.333333333333332], [1.52583114E12, 21.733333333333334], [1.52583438E12, 2972.4166666666665], [1.52583174E12, 14.083333333333334], [1.52583456E12, 26.45], [1.52583396E12, 19.266666666666666], [1.52583234E12, 16.516666666666666]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52583498E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 2.5, "minX": 1.52583078E12, "maxY": 2283.5666666666666, "series": [{"data": [[1.52583102E12, 23.9], [1.52583324E12, 16.466666666666665], [1.52583384E12, 20.633333333333333], [1.52583486E12, 26.4], [1.52583162E12, 26.3], [1.52583222E12, 19.266666666666666], [1.5258312E12, 24.183333333333334], [1.52583282E12, 16.866666666666667], [1.52583444E12, 26.75], [1.5258318E12, 16.183333333333334], [1.52583402E12, 18.55], [1.52583342E12, 24.716666666666665], [1.5258324E12, 22.533333333333335], [1.52583078E12, 428.81666666666666], [1.525833E12, 15.85], [1.5258336E12, 24.25], [1.52583462E12, 26.65], [1.52583138E12, 25.0], [1.52583228E12, 16.433333333333334], [1.5258345E12, 26.716666666666665], [1.5258339E12, 16.6], [1.52583288E12, 16.75], [1.52583126E12, 27.133333333333333], [1.52583408E12, 16.833333333333332], [1.52583186E12, 13.85], [1.52583348E12, 26.833333333333332], [1.52583084E12, 510.1], [1.52583246E12, 15.8], [1.52583144E12, 25.866666666666667], [1.52583306E12, 16.766666666666666], [1.52583468E12, 25.433333333333334], [1.52583204E12, 18.766666666666666], [1.52583426E12, 24.666666666666668], [1.52583366E12, 20.366666666666667], [1.52583264E12, 18.633333333333333], [1.52583132E12, 27.233333333333334], [1.52583354E12, 27.05], [1.52583294E12, 19.466666666666665], [1.52583192E12, 16.283333333333335], [1.52583252E12, 16.666666666666668], [1.52583474E12, 26.583333333333332], [1.52583414E12, 21.116666666666667], [1.5258309E12, 27.133333333333333], [1.52583312E12, 18.3], [1.5258315E12, 25.2], [1.52583432E12, 26.616666666666667], [1.5258321E12, 18.45], [1.52583372E12, 18.383333333333333], [1.5258333E12, 19.766666666666666], [1.52583108E12, 27.083333333333332], [1.5258327E12, 23.2], [1.52583168E12, 16.0], [1.52583492E12, 25.066666666666666], [1.52583198E12, 16.016666666666666], [1.5258348E12, 26.716666666666665], [1.5258342E12, 15.466666666666667], [1.52583096E12, 26.983333333333334], [1.52583258E12, 21.983333333333334], [1.52583156E12, 26.783333333333335], [1.52583378E12, 17.316666666666666], [1.52583318E12, 17.183333333333334], [1.52583216E12, 16.233333333333334], [1.52583276E12, 18.083333333333332], [1.52583498E12, 3.4166666666666665], [1.52583336E12, 19.333333333333332], [1.52583114E12, 21.733333333333334], [1.52583438E12, 26.933333333333334], [1.52583174E12, 14.066666666666666], [1.52583456E12, 26.45], [1.52583396E12, 19.266666666666666], [1.52583234E12, 16.516666666666666]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5258345E12, 1430.7333333333333], [1.52583432E12, 2192.866666666667], [1.52583438E12, 1912.3333333333333], [1.5258342E12, 556.8333333333334], [1.52583426E12, 2211.8166666666666], [1.52583444E12, 2283.5666666666666]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.5258345E12, 835.5333333333333], [1.52583432E12, 1199.4666666666667], [1.52583438E12, 1033.1666666666667], [1.5258342E12, 224.8], [1.52583426E12, 1209.2166666666667], [1.52583444E12, 1250.8166666666666]], "isOverall": false, "label": "503", "isController": false}, {"data": [[1.52583498E12, 2.5]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52583498E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 2.5, "minX": 1.52583078E12, "maxY": 3534.383333333333, "series": [{"data": [[1.52583102E12, 23.9], [1.52583324E12, 16.466666666666665], [1.52583384E12, 20.633333333333333], [1.52583486E12, 26.4], [1.52583162E12, 26.3], [1.52583222E12, 19.266666666666666], [1.5258312E12, 24.183333333333334], [1.52583282E12, 16.866666666666667], [1.52583444E12, 26.75], [1.5258318E12, 16.183333333333334], [1.52583402E12, 18.55], [1.52583342E12, 24.716666666666665], [1.5258324E12, 22.533333333333335], [1.52583078E12, 428.81666666666666], [1.525833E12, 15.85], [1.5258336E12, 24.25], [1.52583462E12, 26.65], [1.52583138E12, 25.0], [1.52583228E12, 16.433333333333334], [1.5258345E12, 26.716666666666665], [1.5258339E12, 16.6], [1.52583288E12, 16.75], [1.52583126E12, 27.133333333333333], [1.52583408E12, 16.833333333333332], [1.52583186E12, 13.85], [1.52583348E12, 26.833333333333332], [1.52583084E12, 510.1], [1.52583246E12, 15.8], [1.52583144E12, 25.866666666666667], [1.52583306E12, 16.766666666666666], [1.52583468E12, 25.433333333333334], [1.52583204E12, 18.766666666666666], [1.52583426E12, 24.666666666666668], [1.52583366E12, 20.366666666666667], [1.52583264E12, 18.633333333333333], [1.52583132E12, 27.233333333333334], [1.52583354E12, 27.05], [1.52583294E12, 19.466666666666665], [1.52583192E12, 16.283333333333335], [1.52583252E12, 16.666666666666668], [1.52583474E12, 26.583333333333332], [1.52583414E12, 21.116666666666667], [1.5258309E12, 27.133333333333333], [1.52583312E12, 18.3], [1.5258315E12, 25.2], [1.52583432E12, 26.616666666666667], [1.5258321E12, 18.45], [1.52583372E12, 18.383333333333333], [1.5258333E12, 19.766666666666666], [1.52583108E12, 27.083333333333332], [1.5258327E12, 23.2], [1.52583168E12, 16.0], [1.52583492E12, 25.066666666666666], [1.52583198E12, 16.016666666666666], [1.5258348E12, 26.716666666666665], [1.5258342E12, 15.466666666666667], [1.52583096E12, 26.983333333333334], [1.52583258E12, 21.983333333333334], [1.52583156E12, 26.783333333333335], [1.52583378E12, 17.316666666666666], [1.52583318E12, 17.183333333333334], [1.52583216E12, 16.233333333333334], [1.52583276E12, 18.083333333333332], [1.52583498E12, 3.4166666666666665], [1.52583336E12, 19.333333333333332], [1.52583114E12, 21.733333333333334], [1.52583438E12, 26.933333333333334], [1.52583174E12, 14.066666666666666], [1.52583456E12, 26.45], [1.52583396E12, 19.266666666666666], [1.52583234E12, 16.516666666666666]], "isOverall": false, "label": "Digisoria Shopfront 132-success", "isController": false}, {"data": [[1.5258345E12, 2266.266666666667], [1.52583498E12, 2.5], [1.52583432E12, 3392.3333333333335], [1.52583438E12, 2945.5], [1.5258342E12, 781.6333333333333], [1.52583426E12, 3421.0333333333333], [1.52583444E12, 3534.383333333333]], "isOverall": false, "label": "Digisoria Shopfront 132-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52583498E12, "title": "Transactions Per Second"}},
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

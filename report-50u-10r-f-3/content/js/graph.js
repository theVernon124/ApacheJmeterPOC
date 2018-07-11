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
        data: {"result": {"minY": 95.0, "minX": 0.0, "maxY": 67158.0, "series": [{"data": [[0.0, 95.0], [0.1, 589.0], [0.2, 680.0], [0.3, 751.0], [0.4, 767.0], [0.5, 784.0], [0.6, 800.0], [0.7, 827.0], [0.8, 852.0], [0.9, 866.0], [1.0, 892.0], [1.1, 919.0], [1.2, 948.0], [1.3, 970.0], [1.4, 996.0], [1.5, 1016.0], [1.6, 1040.0], [1.7, 1055.0], [1.8, 1069.0], [1.9, 1085.0], [2.0, 1115.0], [2.1, 1129.0], [2.2, 1142.0], [2.3, 1156.0], [2.4, 1169.0], [2.5, 1185.0], [2.6, 1202.0], [2.7, 1216.0], [2.8, 1227.0], [2.9, 1242.0], [3.0, 1256.0], [3.1, 1272.0], [3.2, 1281.0], [3.3, 1288.0], [3.4, 1302.0], [3.5, 1315.0], [3.6, 1322.0], [3.7, 1332.0], [3.8, 1339.0], [3.9, 1345.0], [4.0, 1353.0], [4.1, 1364.0], [4.2, 1375.0], [4.3, 1381.0], [4.4, 1395.0], [4.5, 1403.0], [4.6, 1407.0], [4.7, 1419.0], [4.8, 1431.0], [4.9, 1433.0], [5.0, 1441.0], [5.1, 1449.0], [5.2, 1456.0], [5.3, 1460.0], [5.4, 1468.0], [5.5, 1474.0], [5.6, 1482.0], [5.7, 1485.0], [5.8, 1492.0], [5.9, 1497.0], [6.0, 1503.0], [6.1, 1507.0], [6.2, 1518.0], [6.3, 1526.0], [6.4, 1531.0], [6.5, 1535.0], [6.6, 1542.0], [6.7, 1547.0], [6.8, 1553.0], [6.9, 1559.0], [7.0, 1563.0], [7.1, 1571.0], [7.2, 1577.0], [7.3, 1585.0], [7.4, 1595.0], [7.5, 1598.0], [7.6, 1607.0], [7.7, 1613.0], [7.8, 1622.0], [7.9, 1632.0], [8.0, 1637.0], [8.1, 1642.0], [8.2, 1648.0], [8.3, 1655.0], [8.4, 1661.0], [8.5, 1669.0], [8.6, 1680.0], [8.7, 1684.0], [8.8, 1694.0], [8.9, 1705.0], [9.0, 1714.0], [9.1, 1726.0], [9.2, 1737.0], [9.3, 1745.0], [9.4, 1754.0], [9.5, 1765.0], [9.6, 1783.0], [9.7, 1796.0], [9.8, 1802.0], [9.9, 1815.0], [10.0, 1829.0], [10.1, 1846.0], [10.2, 1858.0], [10.3, 1876.0], [10.4, 1893.0], [10.5, 1908.0], [10.6, 1929.0], [10.7, 1949.0], [10.8, 1967.0], [10.9, 1977.0], [11.0, 2024.0], [11.1, 2066.0], [11.2, 2102.0], [11.3, 2191.0], [11.4, 2300.0], [11.5, 2513.0], [11.6, 2709.0], [11.7, 2828.0], [11.8, 2905.0], [11.9, 3010.0], [12.0, 3073.0], [12.1, 3109.0], [12.2, 3159.0], [12.3, 3188.0], [12.4, 3231.0], [12.5, 3271.0], [12.6, 3301.0], [12.7, 3319.0], [12.8, 3333.0], [12.9, 3357.0], [13.0, 3389.0], [13.1, 3420.0], [13.2, 3431.0], [13.3, 3454.0], [13.4, 3474.0], [13.5, 3489.0], [13.6, 3506.0], [13.7, 3522.0], [13.8, 3533.0], [13.9, 3540.0], [14.0, 3559.0], [14.1, 3572.0], [14.2, 3586.0], [14.3, 3597.0], [14.4, 3607.0], [14.5, 3628.0], [14.6, 3638.0], [14.7, 3650.0], [14.8, 3663.0], [14.9, 3673.0], [15.0, 3684.0], [15.1, 3696.0], [15.2, 3702.0], [15.3, 3712.0], [15.4, 3729.0], [15.5, 3744.0], [15.6, 3762.0], [15.7, 3767.0], [15.8, 3779.0], [15.9, 3786.0], [16.0, 3795.0], [16.1, 3804.0], [16.2, 3817.0], [16.3, 3831.0], [16.4, 3835.0], [16.5, 3846.0], [16.6, 3854.0], [16.7, 3865.0], [16.8, 3870.0], [16.9, 3879.0], [17.0, 3884.0], [17.1, 3891.0], [17.2, 3899.0], [17.3, 3905.0], [17.4, 3916.0], [17.5, 3920.0], [17.6, 3927.0], [17.7, 3932.0], [17.8, 3942.0], [17.9, 3951.0], [18.0, 3964.0], [18.1, 3970.0], [18.2, 3974.0], [18.3, 3981.0], [18.4, 3986.0], [18.5, 3994.0], [18.6, 4000.0], [18.7, 4006.0], [18.8, 4011.0], [18.9, 4017.0], [19.0, 4026.0], [19.1, 4033.0], [19.2, 4041.0], [19.3, 4051.0], [19.4, 4057.0], [19.5, 4064.0], [19.6, 4068.0], [19.7, 4074.0], [19.8, 4081.0], [19.9, 4085.0], [20.0, 4092.0], [20.1, 4098.0], [20.2, 4102.0], [20.3, 4110.0], [20.4, 4115.0], [20.5, 4122.0], [20.6, 4126.0], [20.7, 4129.0], [20.8, 4136.0], [20.9, 4140.0], [21.0, 4146.0], [21.1, 4151.0], [21.2, 4154.0], [21.3, 4159.0], [21.4, 4163.0], [21.5, 4171.0], [21.6, 4178.0], [21.7, 4182.0], [21.8, 4187.0], [21.9, 4191.0], [22.0, 4198.0], [22.1, 4203.0], [22.2, 4206.0], [22.3, 4209.0], [22.4, 4216.0], [22.5, 4223.0], [22.6, 4231.0], [22.7, 4235.0], [22.8, 4240.0], [22.9, 4246.0], [23.0, 4252.0], [23.1, 4257.0], [23.2, 4262.0], [23.3, 4268.0], [23.4, 4274.0], [23.5, 4282.0], [23.6, 4289.0], [23.7, 4294.0], [23.8, 4298.0], [23.9, 4306.0], [24.0, 4311.0], [24.1, 4317.0], [24.2, 4323.0], [24.3, 4326.0], [24.4, 4336.0], [24.5, 4342.0], [24.6, 4347.0], [24.7, 4356.0], [24.8, 4359.0], [24.9, 4362.0], [25.0, 4364.0], [25.1, 4371.0], [25.2, 4375.0], [25.3, 4377.0], [25.4, 4382.0], [25.5, 4388.0], [25.6, 4390.0], [25.7, 4394.0], [25.8, 4400.0], [25.9, 4406.0], [26.0, 4409.0], [26.1, 4411.0], [26.2, 4414.0], [26.3, 4420.0], [26.4, 4425.0], [26.5, 4430.0], [26.6, 4435.0], [26.7, 4438.0], [26.8, 4443.0], [26.9, 4448.0], [27.0, 4451.0], [27.1, 4456.0], [27.2, 4459.0], [27.3, 4464.0], [27.4, 4468.0], [27.5, 4471.0], [27.6, 4476.0], [27.7, 4486.0], [27.8, 4488.0], [27.9, 4491.0], [28.0, 4498.0], [28.1, 4505.0], [28.2, 4510.0], [28.3, 4514.0], [28.4, 4517.0], [28.5, 4524.0], [28.6, 4530.0], [28.7, 4534.0], [28.8, 4538.0], [28.9, 4543.0], [29.0, 4546.0], [29.1, 4550.0], [29.2, 4555.0], [29.3, 4559.0], [29.4, 4568.0], [29.5, 4574.0], [29.6, 4578.0], [29.7, 4584.0], [29.8, 4588.0], [29.9, 4591.0], [30.0, 4594.0], [30.1, 4602.0], [30.2, 4606.0], [30.3, 4608.0], [30.4, 4612.0], [30.5, 4619.0], [30.6, 4624.0], [30.7, 4627.0], [30.8, 4633.0], [30.9, 4637.0], [31.0, 4644.0], [31.1, 4648.0], [31.2, 4652.0], [31.3, 4655.0], [31.4, 4662.0], [31.5, 4666.0], [31.6, 4671.0], [31.7, 4674.0], [31.8, 4679.0], [31.9, 4684.0], [32.0, 4687.0], [32.1, 4690.0], [32.2, 4694.0], [32.3, 4698.0], [32.4, 4703.0], [32.5, 4705.0], [32.6, 4711.0], [32.7, 4716.0], [32.8, 4722.0], [32.9, 4726.0], [33.0, 4729.0], [33.1, 4733.0], [33.2, 4735.0], [33.3, 4738.0], [33.4, 4741.0], [33.5, 4745.0], [33.6, 4750.0], [33.7, 4757.0], [33.8, 4761.0], [33.9, 4766.0], [34.0, 4769.0], [34.1, 4774.0], [34.2, 4780.0], [34.3, 4783.0], [34.4, 4786.0], [34.5, 4789.0], [34.6, 4791.0], [34.7, 4793.0], [34.8, 4799.0], [34.9, 4802.0], [35.0, 4807.0], [35.1, 4810.0], [35.2, 4815.0], [35.3, 4817.0], [35.4, 4822.0], [35.5, 4827.0], [35.6, 4833.0], [35.7, 4837.0], [35.8, 4843.0], [35.9, 4848.0], [36.0, 4853.0], [36.1, 4856.0], [36.2, 4860.0], [36.3, 4864.0], [36.4, 4868.0], [36.5, 4873.0], [36.6, 4880.0], [36.7, 4885.0], [36.8, 4892.0], [36.9, 4897.0], [37.0, 4902.0], [37.1, 4906.0], [37.2, 4909.0], [37.3, 4912.0], [37.4, 4916.0], [37.5, 4919.0], [37.6, 4922.0], [37.7, 4928.0], [37.8, 4934.0], [37.9, 4939.0], [38.0, 4943.0], [38.1, 4949.0], [38.2, 4955.0], [38.3, 4962.0], [38.4, 4965.0], [38.5, 4968.0], [38.6, 4970.0], [38.7, 4973.0], [38.8, 4976.0], [38.9, 4981.0], [39.0, 4985.0], [39.1, 4989.0], [39.2, 4995.0], [39.3, 5000.0], [39.4, 5005.0], [39.5, 5010.0], [39.6, 5013.0], [39.7, 5018.0], [39.8, 5025.0], [39.9, 5030.0], [40.0, 5034.0], [40.1, 5038.0], [40.2, 5044.0], [40.3, 5048.0], [40.4, 5051.0], [40.5, 5056.0], [40.6, 5062.0], [40.7, 5067.0], [40.8, 5071.0], [40.9, 5076.0], [41.0, 5081.0], [41.1, 5086.0], [41.2, 5089.0], [41.3, 5093.0], [41.4, 5098.0], [41.5, 5103.0], [41.6, 5108.0], [41.7, 5113.0], [41.8, 5116.0], [41.9, 5120.0], [42.0, 5125.0], [42.1, 5132.0], [42.2, 5135.0], [42.3, 5140.0], [42.4, 5147.0], [42.5, 5154.0], [42.6, 5158.0], [42.7, 5163.0], [42.8, 5169.0], [42.9, 5171.0], [43.0, 5175.0], [43.1, 5179.0], [43.2, 5184.0], [43.3, 5192.0], [43.4, 5196.0], [43.5, 5203.0], [43.6, 5211.0], [43.7, 5214.0], [43.8, 5219.0], [43.9, 5224.0], [44.0, 5227.0], [44.1, 5233.0], [44.2, 5236.0], [44.3, 5245.0], [44.4, 5249.0], [44.5, 5253.0], [44.6, 5260.0], [44.7, 5264.0], [44.8, 5272.0], [44.9, 5276.0], [45.0, 5282.0], [45.1, 5293.0], [45.2, 5300.0], [45.3, 5305.0], [45.4, 5313.0], [45.5, 5320.0], [45.6, 5324.0], [45.7, 5329.0], [45.8, 5334.0], [45.9, 5340.0], [46.0, 5346.0], [46.1, 5353.0], [46.2, 5357.0], [46.3, 5366.0], [46.4, 5371.0], [46.5, 5377.0], [46.6, 5384.0], [46.7, 5390.0], [46.8, 5395.0], [46.9, 5401.0], [47.0, 5406.0], [47.1, 5415.0], [47.2, 5421.0], [47.3, 5431.0], [47.4, 5437.0], [47.5, 5445.0], [47.6, 5452.0], [47.7, 5463.0], [47.8, 5469.0], [47.9, 5476.0], [48.0, 5483.0], [48.1, 5487.0], [48.2, 5497.0], [48.3, 5504.0], [48.4, 5511.0], [48.5, 5522.0], [48.6, 5526.0], [48.7, 5531.0], [48.8, 5539.0], [48.9, 5543.0], [49.0, 5550.0], [49.1, 5560.0], [49.2, 5565.0], [49.3, 5572.0], [49.4, 5584.0], [49.5, 5588.0], [49.6, 5595.0], [49.7, 5600.0], [49.8, 5611.0], [49.9, 5620.0], [50.0, 5624.0], [50.1, 5631.0], [50.2, 5637.0], [50.3, 5644.0], [50.4, 5652.0], [50.5, 5661.0], [50.6, 5666.0], [50.7, 5671.0], [50.8, 5680.0], [50.9, 5689.0], [51.0, 5699.0], [51.1, 5708.0], [51.2, 5716.0], [51.3, 5726.0], [51.4, 5732.0], [51.5, 5741.0], [51.6, 5750.0], [51.7, 5755.0], [51.8, 5766.0], [51.9, 5779.0], [52.0, 5791.0], [52.1, 5802.0], [52.2, 5809.0], [52.3, 5818.0], [52.4, 5831.0], [52.5, 5837.0], [52.6, 5845.0], [52.7, 5861.0], [52.8, 5871.0], [52.9, 5878.0], [53.0, 5887.0], [53.1, 5896.0], [53.2, 5905.0], [53.3, 5910.0], [53.4, 5922.0], [53.5, 5933.0], [53.6, 5944.0], [53.7, 5954.0], [53.8, 5970.0], [53.9, 5979.0], [54.0, 5988.0], [54.1, 6012.0], [54.2, 6020.0], [54.3, 6033.0], [54.4, 6043.0], [54.5, 6053.0], [54.6, 6069.0], [54.7, 6078.0], [54.8, 6090.0], [54.9, 6098.0], [55.0, 6113.0], [55.1, 6133.0], [55.2, 6147.0], [55.3, 6165.0], [55.4, 6184.0], [55.5, 6200.0], [55.6, 6219.0], [55.7, 6231.0], [55.8, 6238.0], [55.9, 6252.0], [56.0, 6270.0], [56.1, 6289.0], [56.2, 6311.0], [56.3, 6328.0], [56.4, 6340.0], [56.5, 6358.0], [56.6, 6365.0], [56.7, 6390.0], [56.8, 6402.0], [56.9, 6415.0], [57.0, 6425.0], [57.1, 6432.0], [57.2, 6445.0], [57.3, 6462.0], [57.4, 6486.0], [57.5, 6501.0], [57.6, 6506.0], [57.7, 6513.0], [57.8, 6521.0], [57.9, 6544.0], [58.0, 6562.0], [58.1, 6569.0], [58.2, 6587.0], [58.3, 6603.0], [58.4, 6615.0], [58.5, 6630.0], [58.6, 6645.0], [58.7, 6655.0], [58.8, 6665.0], [58.9, 6681.0], [59.0, 6690.0], [59.1, 6704.0], [59.2, 6716.0], [59.3, 6729.0], [59.4, 6745.0], [59.5, 6755.0], [59.6, 6765.0], [59.7, 6780.0], [59.8, 6791.0], [59.9, 6804.0], [60.0, 6816.0], [60.1, 6822.0], [60.2, 6844.0], [60.3, 6855.0], [60.4, 6867.0], [60.5, 6885.0], [60.6, 6896.0], [60.7, 6905.0], [60.8, 6916.0], [60.9, 6927.0], [61.0, 6936.0], [61.1, 6946.0], [61.2, 6961.0], [61.3, 6974.0], [61.4, 6983.0], [61.5, 6998.0], [61.6, 7006.0], [61.7, 7023.0], [61.8, 7032.0], [61.9, 7036.0], [62.0, 7044.0], [62.1, 7052.0], [62.2, 7061.0], [62.3, 7077.0], [62.4, 7090.0], [62.5, 7102.0], [62.6, 7112.0], [62.7, 7120.0], [62.8, 7126.0], [62.9, 7133.0], [63.0, 7140.0], [63.1, 7151.0], [63.2, 7159.0], [63.3, 7170.0], [63.4, 7177.0], [63.5, 7183.0], [63.6, 7192.0], [63.7, 7208.0], [63.8, 7212.0], [63.9, 7217.0], [64.0, 7227.0], [64.1, 7234.0], [64.2, 7243.0], [64.3, 7251.0], [64.4, 7261.0], [64.5, 7266.0], [64.6, 7273.0], [64.7, 7286.0], [64.8, 7291.0], [64.9, 7302.0], [65.0, 7309.0], [65.1, 7317.0], [65.2, 7323.0], [65.3, 7332.0], [65.4, 7345.0], [65.5, 7356.0], [65.6, 7364.0], [65.7, 7378.0], [65.8, 7386.0], [65.9, 7391.0], [66.0, 7400.0], [66.1, 7409.0], [66.2, 7420.0], [66.3, 7425.0], [66.4, 7435.0], [66.5, 7443.0], [66.6, 7453.0], [66.7, 7462.0], [66.8, 7470.0], [66.9, 7476.0], [67.0, 7483.0], [67.1, 7489.0], [67.2, 7497.0], [67.3, 7503.0], [67.4, 7510.0], [67.5, 7516.0], [67.6, 7525.0], [67.7, 7529.0], [67.8, 7535.0], [67.9, 7539.0], [68.0, 7542.0], [68.1, 7547.0], [68.2, 7552.0], [68.3, 7557.0], [68.4, 7561.0], [68.5, 7571.0], [68.6, 7576.0], [68.7, 7582.0], [68.8, 7590.0], [68.9, 7599.0], [69.0, 7603.0], [69.1, 7608.0], [69.2, 7613.0], [69.3, 7619.0], [69.4, 7625.0], [69.5, 7631.0], [69.6, 7636.0], [69.7, 7642.0], [69.8, 7649.0], [69.9, 7654.0], [70.0, 7661.0], [70.1, 7671.0], [70.2, 7680.0], [70.3, 7688.0], [70.4, 7693.0], [70.5, 7700.0], [70.6, 7706.0], [70.7, 7714.0], [70.8, 7719.0], [70.9, 7728.0], [71.0, 7735.0], [71.1, 7738.0], [71.2, 7742.0], [71.3, 7749.0], [71.4, 7754.0], [71.5, 7758.0], [71.6, 7764.0], [71.7, 7768.0], [71.8, 7775.0], [71.9, 7780.0], [72.0, 7785.0], [72.1, 7790.0], [72.2, 7796.0], [72.3, 7802.0], [72.4, 7808.0], [72.5, 7815.0], [72.6, 7821.0], [72.7, 7828.0], [72.8, 7834.0], [72.9, 7842.0], [73.0, 7846.0], [73.1, 7849.0], [73.2, 7857.0], [73.3, 7861.0], [73.4, 7867.0], [73.5, 7873.0], [73.6, 7876.0], [73.7, 7882.0], [73.8, 7888.0], [73.9, 7891.0], [74.0, 7897.0], [74.1, 7904.0], [74.2, 7908.0], [74.3, 7911.0], [74.4, 7919.0], [74.5, 7924.0], [74.6, 7927.0], [74.7, 7930.0], [74.8, 7936.0], [74.9, 7940.0], [75.0, 7946.0], [75.1, 7951.0], [75.2, 7955.0], [75.3, 7963.0], [75.4, 7967.0], [75.5, 7973.0], [75.6, 7977.0], [75.7, 7981.0], [75.8, 7987.0], [75.9, 7995.0], [76.0, 8001.0], [76.1, 8004.0], [76.2, 8011.0], [76.3, 8020.0], [76.4, 8028.0], [76.5, 8035.0], [76.6, 8038.0], [76.7, 8044.0], [76.8, 8050.0], [76.9, 8055.0], [77.0, 8063.0], [77.1, 8066.0], [77.2, 8071.0], [77.3, 8076.0], [77.4, 8082.0], [77.5, 8085.0], [77.6, 8089.0], [77.7, 8098.0], [77.8, 8104.0], [77.9, 8109.0], [78.0, 8113.0], [78.1, 8119.0], [78.2, 8124.0], [78.3, 8128.0], [78.4, 8133.0], [78.5, 8140.0], [78.6, 8144.0], [78.7, 8150.0], [78.8, 8153.0], [78.9, 8160.0], [79.0, 8167.0], [79.1, 8173.0], [79.2, 8177.0], [79.3, 8182.0], [79.4, 8187.0], [79.5, 8191.0], [79.6, 8194.0], [79.7, 8198.0], [79.8, 8202.0], [79.9, 8204.0], [80.0, 8210.0], [80.1, 8214.0], [80.2, 8221.0], [80.3, 8226.0], [80.4, 8231.0], [80.5, 8237.0], [80.6, 8243.0], [80.7, 8250.0], [80.8, 8258.0], [80.9, 8265.0], [81.0, 8270.0], [81.1, 8272.0], [81.2, 8281.0], [81.3, 8286.0], [81.4, 8295.0], [81.5, 8302.0], [81.6, 8306.0], [81.7, 8310.0], [81.8, 8314.0], [81.9, 8318.0], [82.0, 8322.0], [82.1, 8328.0], [82.2, 8332.0], [82.3, 8336.0], [82.4, 8340.0], [82.5, 8344.0], [82.6, 8348.0], [82.7, 8354.0], [82.8, 8363.0], [82.9, 8367.0], [83.0, 8372.0], [83.1, 8378.0], [83.2, 8384.0], [83.3, 8387.0], [83.4, 8393.0], [83.5, 8400.0], [83.6, 8405.0], [83.7, 8410.0], [83.8, 8417.0], [83.9, 8424.0], [84.0, 8430.0], [84.1, 8436.0], [84.2, 8439.0], [84.3, 8442.0], [84.4, 8448.0], [84.5, 8454.0], [84.6, 8461.0], [84.7, 8466.0], [84.8, 8470.0], [84.9, 8475.0], [85.0, 8483.0], [85.1, 8489.0], [85.2, 8497.0], [85.3, 8501.0], [85.4, 8505.0], [85.5, 8512.0], [85.6, 8515.0], [85.7, 8521.0], [85.8, 8526.0], [85.9, 8531.0], [86.0, 8536.0], [86.1, 8539.0], [86.2, 8545.0], [86.3, 8553.0], [86.4, 8562.0], [86.5, 8571.0], [86.6, 8576.0], [86.7, 8581.0], [86.8, 8586.0], [86.9, 8589.0], [87.0, 8596.0], [87.1, 8601.0], [87.2, 8606.0], [87.3, 8613.0], [87.4, 8617.0], [87.5, 8621.0], [87.6, 8624.0], [87.7, 8629.0], [87.8, 8636.0], [87.9, 8642.0], [88.0, 8646.0], [88.1, 8651.0], [88.2, 8659.0], [88.3, 8663.0], [88.4, 8670.0], [88.5, 8675.0], [88.6, 8681.0], [88.7, 8686.0], [88.8, 8695.0], [88.9, 8701.0], [89.0, 8711.0], [89.1, 8719.0], [89.2, 8727.0], [89.3, 8731.0], [89.4, 8742.0], [89.5, 8749.0], [89.6, 8755.0], [89.7, 8764.0], [89.8, 8771.0], [89.9, 8774.0], [90.0, 8784.0], [90.1, 8791.0], [90.2, 8800.0], [90.3, 8804.0], [90.4, 8811.0], [90.5, 8819.0], [90.6, 8826.0], [90.7, 8833.0], [90.8, 8840.0], [90.9, 8845.0], [91.0, 8852.0], [91.1, 8862.0], [91.2, 8867.0], [91.3, 8880.0], [91.4, 8895.0], [91.5, 8907.0], [91.6, 8915.0], [91.7, 8924.0], [91.8, 8930.0], [91.9, 8937.0], [92.0, 8946.0], [92.1, 8951.0], [92.2, 8959.0], [92.3, 8970.0], [92.4, 8977.0], [92.5, 8989.0], [92.6, 8998.0], [92.7, 9007.0], [92.8, 9016.0], [92.9, 9023.0], [93.0, 9029.0], [93.1, 9036.0], [93.2, 9047.0], [93.3, 9055.0], [93.4, 9067.0], [93.5, 9075.0], [93.6, 9086.0], [93.7, 9094.0], [93.8, 9104.0], [93.9, 9111.0], [94.0, 9123.0], [94.1, 9130.0], [94.2, 9140.0], [94.3, 9150.0], [94.4, 9158.0], [94.5, 9167.0], [94.6, 9175.0], [94.7, 9189.0], [94.8, 9201.0], [94.9, 9217.0], [95.0, 9225.0], [95.1, 9235.0], [95.2, 9250.0], [95.3, 9258.0], [95.4, 9269.0], [95.5, 9281.0], [95.6, 9295.0], [95.7, 9304.0], [95.8, 9323.0], [95.9, 9344.0], [96.0, 9361.0], [96.1, 9379.0], [96.2, 9399.0], [96.3, 9408.0], [96.4, 9424.0], [96.5, 9438.0], [96.6, 9454.0], [96.7, 9468.0], [96.8, 9485.0], [96.9, 9500.0], [97.0, 9536.0], [97.1, 9572.0], [97.2, 9589.0], [97.3, 9605.0], [97.4, 9630.0], [97.5, 9646.0], [97.6, 9663.0], [97.7, 9695.0], [97.8, 9713.0], [97.9, 9768.0], [98.0, 9815.0], [98.1, 9865.0], [98.2, 9918.0], [98.3, 9956.0], [98.4, 10014.0], [98.5, 10078.0], [98.6, 10118.0], [98.7, 10171.0], [98.8, 10231.0], [98.9, 10311.0], [99.0, 10463.0], [99.1, 10516.0], [99.2, 10645.0], [99.3, 10760.0], [99.4, 10923.0], [99.5, 11102.0], [99.6, 11381.0], [99.7, 11858.0], [99.8, 12780.0], [99.9, 13424.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 246.0, "series": [{"data": [[0.0, 1.0], [67100.0, 1.0], [200.0, 1.0], [300.0, 2.0], [500.0, 6.0], [600.0, 12.0], [700.0, 37.0], [800.0, 43.0], [900.0, 40.0], [1000.0, 50.0], [1100.0, 63.0], [1200.0, 78.0], [1300.0, 107.0], [1400.0, 146.0], [1500.0, 154.0], [1600.0, 130.0], [1700.0, 89.0], [1800.0, 70.0], [1900.0, 49.0], [2000.0, 24.0], [2100.0, 11.0], [2200.0, 8.0], [2300.0, 7.0], [2400.0, 3.0], [2500.0, 5.0], [2600.0, 3.0], [2800.0, 10.0], [2700.0, 11.0], [2900.0, 10.0], [3000.0, 17.0], [3100.0, 24.0], [3300.0, 44.0], [3200.0, 28.0], [3400.0, 51.0], [3500.0, 77.0], [3700.0, 88.0], [3600.0, 81.0], [3800.0, 115.0], [3900.0, 134.0], [4000.0, 155.0], [4100.0, 187.0], [4200.0, 173.0], [4300.0, 195.0], [4400.0, 217.0], [4500.0, 203.0], [4600.0, 222.0], [4800.0, 208.0], [4700.0, 246.0], [5100.0, 196.0], [4900.0, 230.0], [5000.0, 214.0], [5300.0, 163.0], [5200.0, 173.0], [5600.0, 130.0], [5400.0, 138.0], [5500.0, 141.0], [5700.0, 105.0], [5800.0, 104.0], [5900.0, 90.0], [6100.0, 56.0], [6000.0, 87.0], [6200.0, 66.0], [6300.0, 57.0], [6400.0, 73.0], [6600.0, 77.0], [6500.0, 78.0], [6900.0, 90.0], [6800.0, 72.0], [6700.0, 82.0], [7100.0, 117.0], [7000.0, 89.0], [7400.0, 125.0], [7200.0, 122.0], [7300.0, 109.0], [7500.0, 165.0], [7600.0, 154.0], [7900.0, 191.0], [7700.0, 174.0], [7800.0, 176.0], [8000.0, 172.0], [8100.0, 194.0], [8200.0, 174.0], [8700.0, 128.0], [8500.0, 181.0], [8300.0, 199.0], [8400.0, 172.0], [8600.0, 178.0], [8900.0, 118.0], [8800.0, 122.0], [9000.0, 109.0], [9200.0, 86.0], [9100.0, 104.0], [9600.0, 45.0], [9400.0, 66.0], [9300.0, 54.0], [9700.0, 28.0], [9500.0, 36.0], [10100.0, 24.0], [9800.0, 19.0], [9900.0, 20.0], [10000.0, 13.0], [10200.0, 11.0], [10500.0, 10.0], [10300.0, 5.0], [10400.0, 12.0], [10700.0, 11.0], [10600.0, 6.0], [11000.0, 5.0], [11100.0, 2.0], [10900.0, 8.0], [11200.0, 7.0], [10800.0, 3.0], [11300.0, 2.0], [11400.0, 3.0], [11700.0, 2.0], [11600.0, 2.0], [11500.0, 1.0], [11900.0, 2.0], [11800.0, 2.0], [12100.0, 1.0], [12200.0, 1.0], [12500.0, 1.0], [12300.0, 2.0], [12700.0, 2.0], [12600.0, 1.0], [13300.0, 2.0], [13100.0, 3.0], [12800.0, 1.0], [13000.0, 1.0], [12900.0, 2.0], [13800.0, 1.0], [13600.0, 1.0], [13400.0, 3.0], [13500.0, 1.0], [14000.0, 1.0], [14700.0, 1.0], [14400.0, 1.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 67100.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 51.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 9216.0, "series": [{"data": [[1.0, 575.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 51.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 9216.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 43.58598726114651, "minX": 1.5251007E12, "maxY": 50.0, "series": [{"data": [[1.52510148E12, 50.0], [1.52510118E12, 50.0], [1.52510082E12, 50.0], [1.52510178E12, 50.0], [1.52510112E12, 50.0], [1.52510094E12, 50.0], [1.52510124E12, 50.0], [1.52510184E12, 47.78715596330274], [1.52510154E12, 50.0], [1.52510088E12, 50.0], [1.5251007E12, 43.58598726114651], [1.52510166E12, 50.0], [1.525101E12, 50.0], [1.5251016E12, 50.0], [1.5251013E12, 50.0], [1.52510172E12, 50.0], [1.52510142E12, 50.0], [1.52510076E12, 50.0], [1.52510106E12, 50.0], [1.52510136E12, 50.0]], "isOverall": false, "label": "Digisoria Customer 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510184E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 232.0, "minX": 1.0, "maxY": 8597.0, "series": [{"data": [[32.0, 2740.75], [2.0, 931.0], [35.0, 5729.0], [34.0, 1026.5], [37.0, 3304.5], [36.0, 232.0], [38.0, 3546.75], [39.0, 4261.0], [40.0, 2797.0], [41.0, 2364.0], [42.0, 3474.5], [43.0, 2758.0], [44.0, 5751.75], [45.0, 2871.6666666666665], [47.0, 5045.25], [46.0, 2252.0], [48.0, 3221.0], [49.0, 2709.0], [3.0, 3835.0], [50.0, 5901.637212643667], [4.0, 8261.0], [5.0, 3152.0], [6.0, 5180.0], [7.0, 1647.0], [8.0, 1203.5], [9.0, 1706.0], [10.0, 1174.0], [12.0, 3255.3333333333335], [13.0, 3177.0], [14.0, 557.0], [15.0, 1558.0], [1.0, 4845.0], [17.0, 2100.75], [18.0, 1964.0], [19.0, 2237.3333333333335], [20.0, 1588.6666666666667], [21.0, 1928.6], [22.0, 1936.0], [23.0, 3443.0], [24.0, 7902.0], [25.0, 859.0], [26.0, 1941.3333333333333], [27.0, 1602.0], [28.0, 8597.0], [29.0, 1433.0], [30.0, 2873.0], [31.0, 2815.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}, {"data": [[49.77514732777888, 5871.970026417388]], "isOverall": false, "label": "Digisoria Shopfront 132-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 50.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 3683.4, "minX": 1.5251007E12, "maxY": 117167.75, "series": [{"data": [[1.52510148E12, 115397.21666666666], [1.52510118E12, 111631.43333333333], [1.52510082E12, 113402.43333333333], [1.52510178E12, 109862.75], [1.52510112E12, 110304.45], [1.52510094E12, 103878.5], [1.52510124E12, 116288.0], [1.52510184E12, 113412.5], [1.52510154E12, 110968.21666666666], [1.52510088E12, 113627.2], [1.5251007E12, 34773.53333333333], [1.52510166E12, 115838.78333333334], [1.525101E12, 108821.51666666666], [1.5251016E12, 117167.75], [1.5251013E12, 113406.81666666667], [1.52510172E12, 112739.45], [1.52510142E12, 115397.45], [1.52510076E12, 112076.06666666667], [1.52510106E12, 111406.05], [1.52510136E12, 112072.86666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52510148E12, 13877.933333333332], [1.52510118E12, 13424.666666666666], [1.52510082E12, 13636.6], [1.52510178E12, 13215.1], [1.52510112E12, 13267.133333333333], [1.52510094E12, 12491.733333333334], [1.52510124E12, 13987.733333333334], [1.52510184E12, 13573.433333333332], [1.52510154E12, 13346.6], [1.52510088E12, 13667.066666666668], [1.5251007E12, 3683.4], [1.52510166E12, 13931.733333333334], [1.525101E12, 13092.566666666668], [1.5251016E12, 14090.133333333333], [1.5251013E12, 13642.033333333333], [1.52510172E12, 13557.466666666667], [1.52510142E12, 13878.3], [1.52510076E12, 13479.133333333333], [1.52510106E12, 13396.1], [1.52510136E12, 13479.333333333334]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510184E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 4874.426751592358, "minX": 1.5251007E12, "maxY": 6310.093816631124, "series": [{"data": [[1.52510148E12, 5762.14011516315], [1.52510118E12, 6102.305555555549], [1.52510082E12, 5867.646484375], [1.52510178E12, 6010.754032258066], [1.52510112E12, 5881.473895582335], [1.52510094E12, 6310.093816631124], [1.52510124E12, 5708.687619047614], [1.52510184E12, 5642.680733944956], [1.52510154E12, 5974.648702594811], [1.52510088E12, 5798.637426900586], [1.5251007E12, 4874.426751592358], [1.52510166E12, 5786.950286806884], [1.525101E12, 6161.351626016261], [1.5251016E12, 5654.916824196597], [1.5251013E12, 5833.445312499992], [1.52510172E12, 5848.8055009823165], [1.52510142E12, 5732.422264875244], [1.52510076E12, 5894.446640316202], [1.52510106E12, 6019.532803180913], [1.52510136E12, 5977.320158102757]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510184E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 105.80039920159683, "minX": 1.5251007E12, "maxY": 160.1783439490447, "series": [{"data": [[1.52510148E12, 112.62955854126672], [1.52510118E12, 113.90674603174604], [1.52510082E12, 113.607421875], [1.52510178E12, 114.15322580645167], [1.52510112E12, 114.5662650602409], [1.52510094E12, 113.75053304904056], [1.52510124E12, 113.65142857142853], [1.52510184E12, 108.29174311926606], [1.52510154E12, 105.80039920159683], [1.52510088E12, 116.01949317738799], [1.5251007E12, 160.1783439490447], [1.52510166E12, 109.06118546845119], [1.525101E12, 114.71951219512198], [1.5251016E12, 113.25141776937616], [1.5251013E12, 119.65039062499997], [1.52510172E12, 111.38506876227896], [1.52510142E12, 107.58925143953937], [1.52510076E12, 110.40513833992094], [1.52510106E12, 113.86282306163021], [1.52510136E12, 106.39525691699603]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510184E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 66.49209486166006, "minX": 1.5251007E12, "maxY": 110.67515923566874, "series": [{"data": [[1.52510148E12, 73.14779270633392], [1.52510118E12, 74.77380952380956], [1.52510082E12, 74.25195312500004], [1.52510178E12, 75.00604838709684], [1.52510112E12, 74.67269076305222], [1.52510094E12, 74.4434968017057], [1.52510124E12, 73.89904761904762], [1.52510184E12, 68.42201834862385], [1.52510154E12, 66.85828343313366], [1.52510088E12, 76.05458089668616], [1.5251007E12, 110.67515923566874], [1.52510166E12, 68.90822179732315], [1.525101E12, 74.82520325203258], [1.5251016E12, 74.05293005671084], [1.5251013E12, 79.88671875000004], [1.52510172E12, 72.16110019646364], [1.52510142E12, 67.68138195777348], [1.52510076E12, 70.26086956521733], [1.52510106E12, 74.66600397614307], [1.52510136E12, 66.49209486166006]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510184E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 531.0, "minX": 1.5251007E12, "maxY": 14783.0, "series": [{"data": [[1.52510148E12, 11367.0], [1.52510118E12, 14783.0], [1.52510082E12, 11027.0], [1.52510178E12, 10184.0], [1.52510112E12, 10945.0], [1.52510094E12, 13824.0], [1.52510124E12, 10499.0], [1.52510184E12, 10159.0], [1.52510154E12, 11257.0], [1.52510088E12, 11381.0], [1.5251007E12, 9638.0], [1.52510166E12, 11011.0], [1.525101E12, 13507.0], [1.5251016E12, 10722.0], [1.5251013E12, 11583.0], [1.52510172E12, 9658.0], [1.52510142E12, 10058.0], [1.52510076E12, 10729.0], [1.52510106E12, 12261.0], [1.52510136E12, 10881.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52510148E12, 837.0], [1.52510118E12, 616.0], [1.52510082E12, 774.0], [1.52510178E12, 585.0], [1.52510112E12, 624.0], [1.52510094E12, 999.0], [1.52510124E12, 1262.0], [1.52510184E12, 804.0], [1.52510154E12, 784.0], [1.52510088E12, 606.0], [1.5251007E12, 588.0], [1.52510166E12, 873.0], [1.525101E12, 1185.0], [1.5251016E12, 1193.0], [1.5251013E12, 531.0], [1.52510172E12, 708.0], [1.52510142E12, 638.0], [1.52510076E12, 950.0], [1.52510106E12, 935.0], [1.52510136E12, 569.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52510148E12, 8821.2], [1.52510118E12, 8908.8], [1.52510082E12, 8761.800000000001], [1.52510178E12, 8790.300000000001], [1.52510112E12, 8878.0], [1.52510094E12, 8882.8], [1.52510124E12, 8846.500000000002], [1.52510184E12, 8788.800000000001], [1.52510154E12, 8819.0], [1.52510088E12, 8774.5], [1.5251007E12, 8525.000000000002], [1.52510166E12, 8791.0], [1.525101E12, 8907.3], [1.5251016E12, 8800.0], [1.5251013E12, 8832.7], [1.52510172E12, 8786.7], [1.52510142E12, 8833.2], [1.52510076E12, 8631.2], [1.52510106E12, 8909.400000000001], [1.52510136E12, 8852.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52510148E12, 10746.029999999992], [1.52510118E12, 11152.600000000004], [1.52510082E12, 10111.92], [1.52510178E12, 10499.090000000002], [1.52510112E12, 11100.0], [1.52510094E12, 11148.200000000008], [1.52510124E12, 10947.94], [1.52510184E12, 10465.079999999998], [1.52510154E12, 10723.400000000005], [1.52510088E12, 10196.299999999997], [1.5251007E12, 9633.94], [1.52510166E12, 10591.439999999997], [1.525101E12, 11665.869999999992], [1.5251016E12, 10640.859999999997], [1.5251013E12, 10962.870000000006], [1.52510172E12, 10515.99], [1.52510142E12, 10778.859999999993], [1.52510076E12, 10187.24], [1.52510106E12, 11286.720000000001], [1.52510136E12, 10905.21]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52510148E12, 9281.05], [1.52510118E12, 9421.199999999999], [1.52510082E12, 9221.2], [1.52510178E12, 9237.15], [1.52510112E12, 9449.0], [1.52510094E12, 9492.599999999999], [1.52510124E12, 9341.150000000001], [1.52510184E12, 9229.4], [1.52510154E12, 9273.0], [1.52510088E12, 9277.65], [1.5251007E12, 9117.999999999998], [1.52510166E12, 9255.8], [1.525101E12, 9582.55], [1.5251016E12, 9260.0], [1.5251013E12, 9321.349999999999], [1.52510172E12, 9234.949999999999], [1.52510142E12, 9276.099999999999], [1.52510076E12, 9206.999999999998], [1.52510106E12, 9478.4], [1.52510136E12, 9306.3]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510184E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2706.5, "minX": 2.0, "maxY": 67158.0, "series": [{"data": [[2.0, 4890.0], [8.0, 5643.5], [9.0, 5620.0], [7.0, 6186.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[8.0, 67158.0], [9.0, 2706.5]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 9.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 112.0, "minX": 2.0, "maxY": 118.0, "series": [{"data": [[2.0, 118.0], [8.0, 114.0], [9.0, 115.0], [7.0, 113.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[8.0, 112.0], [9.0, 115.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 9.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 3.45, "minX": 1.5251007E12, "maxY": 8.816666666666666, "series": [{"data": [[1.52510148E12, 8.683333333333334], [1.52510118E12, 8.4], [1.52510082E12, 8.533333333333333], [1.52510178E12, 8.266666666666667], [1.52510112E12, 8.3], [1.52510094E12, 7.816666666666666], [1.52510124E12, 8.75], [1.52510184E12, 8.25], [1.52510154E12, 8.35], [1.52510088E12, 8.55], [1.5251007E12, 3.45], [1.52510166E12, 8.716666666666667], [1.525101E12, 8.2], [1.5251016E12, 8.816666666666666], [1.5251013E12, 8.533333333333333], [1.52510172E12, 8.483333333333333], [1.52510142E12, 8.683333333333334], [1.52510076E12, 8.433333333333334], [1.52510106E12, 8.383333333333333], [1.52510136E12, 8.433333333333334]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510184E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.5251007E12, "maxY": 8.816666666666666, "series": [{"data": [[1.52510148E12, 8.683333333333334], [1.52510118E12, 8.4], [1.52510082E12, 8.533333333333333], [1.52510178E12, 8.266666666666667], [1.52510112E12, 8.3], [1.52510094E12, 7.816666666666666], [1.52510124E12, 8.75], [1.52510184E12, 8.25], [1.52510154E12, 8.35], [1.52510088E12, 8.55], [1.5251007E12, 2.6166666666666667], [1.52510166E12, 8.716666666666667], [1.525101E12, 8.183333333333334], [1.5251016E12, 8.816666666666666], [1.5251013E12, 8.533333333333333], [1.52510172E12, 8.483333333333333], [1.52510142E12, 8.683333333333334], [1.52510076E12, 8.433333333333334], [1.52510106E12, 8.383333333333333], [1.52510136E12, 8.433333333333334]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.525101E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: org.apache.http.ConnectionClosedException", "isController": false}, {"data": [[1.52510184E12, 0.8333333333333334]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52510184E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.5251007E12, "maxY": 8.816666666666666, "series": [{"data": [[1.52510148E12, 8.683333333333334], [1.52510118E12, 8.4], [1.52510082E12, 8.533333333333333], [1.52510178E12, 8.266666666666667], [1.52510112E12, 8.3], [1.52510094E12, 7.816666666666666], [1.52510124E12, 8.75], [1.52510184E12, 8.25], [1.52510154E12, 8.35], [1.52510088E12, 8.55], [1.5251007E12, 2.6166666666666667], [1.52510166E12, 8.716666666666667], [1.525101E12, 8.183333333333334], [1.5251016E12, 8.816666666666666], [1.5251013E12, 8.533333333333333], [1.52510172E12, 8.483333333333333], [1.52510142E12, 8.683333333333334], [1.52510076E12, 8.433333333333334], [1.52510106E12, 8.383333333333333], [1.52510136E12, 8.433333333333334]], "isOverall": false, "label": "Digisoria Shopfront 132-success", "isController": false}, {"data": [[1.525101E12, 0.016666666666666666], [1.52510184E12, 0.8333333333333334]], "isOverall": false, "label": "Digisoria Shopfront 132-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52510184E12, "title": "Transactions Per Second"}},
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

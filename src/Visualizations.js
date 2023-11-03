//Import libraries
import React, {useState, useEffect, useRef} from "react";
//For visualizations
import CytoscapeComponent from "react-cytoscapejs";
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
//For accessing shared component variables (such as the current word and options)
import { useDictContext } from "./Context";

//Use the dagre layout
cytoscape.use(dagre);

//Define visualizations function
export default function Visualizations(props) {

    // =========== ALL STATE AND INITIALIZATION VARIABLES ===========

    //Get variables needed from the shared context
    const {nGramDict, modelType, textGenMode, setTextGenMode,
           generatedText, setGeneratedText, generate_text,
           currentWord, setCurrentWord, key, setKey, 
           enableNextWord, setEnableNextWord, keysAdded, setKeysAdded,
           wordOptions, setWordOptions, wordCount, setWordCount,
           clearButtonClicked, setClearButtonClicked} = useDictContext();

    //State variable to check whether the current display has successfully been reset
    const [isReset, setIsReset] = useState(false);
    
    //Variables to store the layout, layout type, and a flag to signal whether the layout has been built
    const [layout, setLayout] = useState();
    const [layoutName, setLayoutName] = useState("dagre");
    const [layoutBuilt, setLayoutBuilt] = useState(false);

    //Declare a state variable to house the graph and keep track of all added nodes
    const [graphData, setGraphData] = useState([]);
    const [nodesAdded, setNodesAdded] = useState([]);

    //Flag for whether the graph has been re-rendered at the end of text generation
    const [graphReRendered, setGraphReRendered] = useState(false);
    //Flag to determine whether the graph has finished rendering (automatic)
    const [autoGraphRendered, setAutoGraphRendered] = useState(false);
    //Flag for whether all pending nodes have been added - this is a signal for the previous option removal process to begin
    const [pendingNodesAdded, setPendingNodesAdded] = useState(false);

    //Flag to allow or disable backwards connections (prevents drawing multiple connections per repetition)
    let biBackwardsCnxAllowed = false;
    //Flag to ensure that tri-and-tetra-gram models are only adding single connections between nodes at a time (again to prevent multiple re-draws)
    let triTetraCnxAllowed = false;

    //Set current reference of graph div to null
    let graphRef = React.useRef(null);

    //Create string to house manually generated text if present
    const [manualText, setManualText] = useState("");

    //Create a counter variable to track (for automatic text generation mode) what word of generatedText is currently being rendered on the graph
    let genCounter = 0;

    //A flag to determine whether all non-key wordOptions for the previous keys have been removed
    let prevKeyOptionsRemoved = true;
    
    //Set graph style parameters
    const graphStyle = [
        {
            //Style parameters for nodes
            selector: "node",
            style : {
                'background-color': '#ADD8E6', // Node background color
                'label': 'data(label)', // Display the node's label
                'shape': 'ellipse', // Node shape
                'width': '100px', // Node width
                'height': '100px', // Node height
                'font-size': '20px', // Label font size
                'text-valign': 'center', // Vertical alignment of label
                'text-halign': 'center', // Horizontal alignment of label
                'text-wrap' : 'wrap',
                'text-max-width' : "100px"
            }
        },
        {
            //Style parameters for edges
            selector: 'edge', // Apply the style to all edges
            style: {
                'width': 5, // Edge width
                'line-color': 'black', // Edge color
                "curve-style" : "bezier",
                'target-arrow-shape': 'triangle',
                'target-arrow-color' : 'black',
                'source-arrow-color' : 'black'
            }
        }
    ]

    // =========== ALL FUNCTIONS AND EFFECTS ===========

    // RESET FUNCTIONS

    //Declare a reset function to change all parameters back to default values upon component mount or mode change
    const resetGraph = () => {

        //Set the isReset flag to false
        setIsReset(false);

        //Reset layout and build status (name remains constant)
        setLayout();
        setLayoutBuilt(false);

        //Empty current graph and list of both added keys (stored in context) and nodes
        setGraphData([]);
        setKeysAdded([]);
        setNodesAdded([]);
        setWordOptions([]);
        setKey("");
        setCurrentWord("");

        //Set re-rendering and colour-related flags for the graph to false
        setGraphReRendered(false);
        setAutoGraphRendered(false);

        //Set Bi-gram backwards connection and Tri-and-Tetra-gram branch connection modulating flags to false
        biBackwardsCnxAllowed = false;
        triTetraCnxAllowed = false;

        //If we are in manual mode, set the manual text to be blank
        if (textGenMode === "manual") {setManualText("")};

        //Set the automatic text counter to zero
        genCounter = 0;
        
    }

    //When the component first mounts and whenever the text generation mode changes, reset the graph
    //Do so additionally when the model type changes
    useEffect(() => {
        resetGraph();
    }, [textGenMode, modelType, nGramDict])

    //Also reset the graph if the mode of generation is automatic and the generated text contant has changed
    useEffect(() => {
        if (textGenMode === "automatic") {resetGraph();}
    }, [generatedText])
    //Reset the graph additionally when the clear button in pane three has been clicked - this is only possible for manual text generation mode, but the execution is identical
    useEffect(() => {
        if (clearButtonClicked) {resetGraph()};
    }, [clearButtonClicked])

    //If the layout has not been yet defined or built, and the graph is currently empty, set the reset flag to true - all variables are now at their default position
    useEffect(() => {
        //Verify that the aforementioned is the case
        if (layout === undefined && layoutBuilt === false && graphData.length === 0) {
            setIsReset(true);
        }
    }, [layout, layoutBuilt, graphData])

    // GRAPH DATA MANIPULATION FUNCTIONS

    //A function to build the next node of a graph, assuming that a starting key is present
    const buildGraph = () => {
        
        //If the key is not already present on the graph, add it
        if (!nodesAdded.includes(key)) { 
            //Create new data point
            let newGraphPoint = {data : {id : key, label : key.replace(".", "<PERIOD>").replace("!", "<EXCL>").replace("?", "<Q>").trim()}, position : { x:Math.random() * 100 + 50, y: Math.random() * 100 + 50}};
            //Add point to the graph
            setGraphData(existingGraph => [...existingGraph, newGraphPoint]);
            //Track point (add to list of all added nodes)
            setNodesAdded(existingNodes => [...existingNodes, key]);
        }

        //Check to see if the current key has been duplicated previously - if so, we must add a seperate backwards connection after adding regular connections.
        const nDuplicateKeys = keysAdded.filter((graph_key) => (graph_key === key)).length - 1;

        //React sometimes renders windows multiple times. To prevent multiple renders from adding multiple nodes, ensure that two identical consecutive nodes cannot be placed
        //In other words - when tracking keys in the list of current keys, verify that the previous one is not identical to the current one
        //Verify that the previous key is not identical to the current key
        if (keysAdded.length < 1) {setKeysAdded(existingKeys => [...existingKeys, key]);}
        else if (keysAdded[keysAdded.length - 1] !== key) {setKeysAdded(existingKeys => [...existingKeys, key]);}

        //Tri-and-Tetra-gram models should always add a branch between the previous and current key
        //This should be done ONCE per key change (thus, employ the flag)
        //Verify that the current key is NOT a duplicate of the previous (otherwise no connection is needed nor possible)

        if ((modelType === "Tri-gram" || modelType === "Tetra-gram") && triTetraCnxAllowed && nDuplicateKeys < 1) {
            //Establish branch connection between previous and current key
            let newTriTetraBranch = {data : {source : keysAdded[keysAdded.length - 2], target : key, label : keysAdded[keysAdded.length - 2] + key}};
            //Add new branch to existing graph
            setGraphData(existingGraph => [...existingGraph, newTriTetraBranch]);
            //Disable additional branches between nodes. This is re-enabled once the key changes and exists to prevent adding identical branches multiple times.
            triTetraCnxAllowed = false;
        }

        //If duplicates are present add a backwards connection between the current key and the previous one
        //Verify that backwards connections are allowed
        if (nDuplicateKeys >= 1 && biBackwardsCnxAllowed) {
            //Create backwards connection branch
            let backwardsCnxBranch = {data : {source : keysAdded[keysAdded.length - 2], target : key, label : keysAdded[keysAdded.length - 2] + key + "BackwardsCnx"}};
            //Add to graph
            setGraphData(existingGraph => [...existingGraph, backwardsCnxBranch]);
            //Disable future backwards connections until a new key is added
            biBackwardsCnxAllowed = false;
        }
        console.log("CURRENT KEY WORD:", key);
        //Iterate through all potential selection options (child nodes) for this key and add to the graph
        //Do this only if not the final word in the sentence. If this is the last word, simply add another node that states "END OF CHAIN".
        if (generatedText.split(" ")[generatedText.split(" ").length - 1] !== key) {
            wordOptions.forEach(word => {
                console.log("WORD CNX BEING DRAWN TO:", word)
                //Verify that the respective node is not already present on the graph
                if (!nodesAdded.includes(word)) {
    
                    //Create a label variable. This will be changed depending on the model type
                    let label = word;
    
                    //If the current model is a Tri-or-Tetra-gram, the label must include the previous key and previous two keys respectively
                    if (modelType === "Tri-gram") {
                        label = key.split(" ").slice(-1).toString() + " " + label;
                    } else if (modelType === "Tetra-gram") {
                        label = key.split(" ").slice(-2).toString() + " " + label;
                    }
    
                    //Replace all commas and punctuation marks - the latter with specialized tokens
                    label = label.replace(",", " ").replace(".", "<PERIOD>").replace("!", "<EXCL>").replace("?", "<Q>").trim();
                    
                    //Add both the node word and the branch between the current key and the node word to the graph
                    let newWordOption = {data : {id : word, label : label}, position : { x:Math.random() * 2000 + 50, y: Math.random() * 2000 + 50}};
                    setGraphData(existingGraph => [...existingGraph, newWordOption]);
    
                    //Track word in list of added nodes
                    //Add the non-parsed (non-tokenized) variants of the words - for instance, add "." instead of "<PERIOD>"
                    setNodesAdded(existingNodes => [...existingNodes, word]);
                    let newKeyWordBranch = { data : {source : key, target : word, word : key + word}};
                    
                    setGraphData(existingGraph => [...existingGraph, newKeyWordBranch]);
                
                }
            })
        //Otherwise, replace with designated end node as long as the key is not END OF NODE
        //Do this only for automatic text generation
        } else if (textGenMode === "automatic" && !graphReRendered){
            const label = "END OF CHAIN"

            //Add node
            let endNode = {data : {id : label, label : label}, position : { x:Math.random() * 2000 + 50, y: Math.random() * 2000 + 50}}
            setGraphData(existingGraph => [...existingGraph, endNode]);

            //Add branch
            let endBranch = {data : {source : key, target : label, label : key + label}}
            setGraphData(existingGraph => [...existingGraph, endBranch]);
            setGraphReRendered(true);

            //The automatic graph has now completed rendering - set flag accordingly
            setAutoGraphRendered(true);
            setPendingNodesAdded(true)
            
        }

        //Indicate that all pending nodes have been added until the next call - this allows for the removal of previous nodes to take place without race conditions
        setPendingNodesAdded(true);

    }

    useEffect(() => {
        if (graphReRendered) {
            // buildGraph();
            console.log("WORKING")
            setLayout({
                name: layoutName,
                fit: true,
                rankDir: "LR",
                directed: false,
                circle: true,
                // grid: false,
                avoidOverlap: true,
                spacingFactor: 1.5 + Math.random() * (1.8 - 1.5),
                nodeDimensionsIncludeLabels: true,
                animate: true,
                gravity : 1,
                randomize: false,
                ready: true,
                stop: true,
                klay : {
                    addUnnecessaryBendpoints: false,
                    mergeHierarchyCrossingEdges: false,
                    direction : "RIGHT",
                    // crossingMinimization: "INTERACTIVE",
                    feedbackEdges: true,
                    mergeEdges : true,
                    //nodePlacement : "LINEAR_SEGMENTS"
                }
            });

            setGraphReRendered(false);
        }

    }, [graphReRendered])

    //To remove previous nodes that have NOT been selected - in other words, to remove previous wordOptions values and de-clutter the graph
    const removePreviousOptions = () => {
        //Make sure that the length of the keys is greater than 1
        if (keysAdded.length > 1) {
            
            //Find the last introduced key
            const previous_key = keysAdded[keysAdded.length - 2];
            //Get all non-selected word names associated with the previous key
            let unselected_node_names = [];

            //Iterate over graph data and store
            graphData.forEach(data_entry =>{
                //Only consider branch data. Find all target words, being careful not to add the current key itself.
                if ("source" in data_entry["data"] && data_entry["data"]["source"] === previous_key && data_entry["data"]["target"] !== key) {

                    //Ensure that the target word is NOT already a key (which may be the case if the node is being revisited)
                    if (!keysAdded.includes(data_entry["data"]["target"])) {
                        unselected_node_names.push(data_entry["data"]["target"]);
                    }

                }
            })

            //Filter manual graph such that any branches and nodes within the unselected_node_names list are excluded
            //Filter for branches
            let filtered_graph = graphData.filter((data_item, data_index) => 
                                                                data_item["data"]["target"] === undefined || unselected_node_names.indexOf(data_item["data"]["target"]) === -1
                                                            );


            //Filter for nodes. Iterate over all unselected node names
            unselected_node_names.forEach(unselected_node => {
                graphData.forEach(data_entry => {

                    //Verify that the data entry is a node. If it's ID is the unselected node name, remove.
                    if (!("source" in data_entry["data"]) && data_entry["data"]["id"] === unselected_node) {
                        filtered_graph = filtered_graph.filter((data_sample, index) => index !== filtered_graph.indexOf(data_entry))
                    }

                })
            })

            //Remove unselected nodes from active. Filter via copy of array first
            const filtered_keys_added = nodesAdded.filter((key) => !unselected_node_names.includes(key));
            //Assign filtered keys.
            setNodesAdded(filtered_keys_added);

            //Assign filtered graph to the currently active graph
            setGraphData(filtered_graph);

            // //Set the removal flag to true
            // setPrevWordOpsRemoved(true);

            // buildGraph();
            // colorGraph();
        }
    }

    //To assign various colours to all nodes - green for keys, red for options, and light blue for all others
    const colorGraph = () => {

        //Iterate over all nodes
        graphData.forEach(data_entry => {

            //Check that the cytoscape reference is up and running
            if (graphRef.current && !("source" in data_entry["data"])) {

                const word = data_entry["data"]["id"];
                const cy = graphRef.current._cy;

                //Colour the node depending on whether the word is a key or a wordOption
                //Keys are coloured dark green with white font
                //Default colouring only occurs when the automatic graph has not been rendered; otherwise, the END OF CHAIN node should be red and all others should simply be blue
                if (word === key && !autoGraphRendered) {

                    cy.nodes('[id=\"' + word + '\"]').style("background-color", "#14532D");
                    cy.nodes('[id=\"' + word + '\"]').style("color", "white");

                //Word selection options (and the final END OF CHAIN node) are coloured light red with black font
                } else if ((wordOptions.includes(word) && !autoGraphRendered) || word === "END OF CHAIN") {

                    cy.nodes('[id=\"' + word + '\"]').style("background-color", "#FF786E");
                    cy.nodes('[id=\"' + word + '\"]').style("color", "black");

                //All previous keys (all other nodes) are coloured light blue with black font
                } else {

                    cy.nodes('[id=\"' + word + '\"]').style("background-color", "#ADD8E6");
                    cy.nodes('[id=\"' + word + '\"]').style("color", "black");

                }

            } 
        })

    }

    //Check continuously for whether the graph has been reset, the key has changed, or potential word choices have been updated
    //If any of the above are true, the key is NOT blank (i.e. it has been chosen), and the graph has successfully been reset, re-render the graph
    //Simultaneously, re-define the layout.
    useEffect(() => {
        //Verify reset and key selection, as well as the fact that previous key options have all been removed
        if (isReset && key !== " " && key !== "") {
            //Build the graph
            buildGraph();
            //Set the graph's layout
            setLayout({
                name: layoutName,
                fit: true,
                rankDir: "LR",
                directed: false,
                circle: true,
                // grid: false,
                avoidOverlap: true,
                spacingFactor: 1.5 + Math.random() * (1.8 - 1.5),
                nodeDimensionsIncludeLabels: true,
                animate: true,
                gravity : 1,
                randomize: false,
                ready: true,
                stop: true,
                klay : {
                    addUnnecessaryBendpoints: false,
                    mergeHierarchyCrossingEdges: false,
                    direction : "RIGHT",
                    // crossingMinimization: "INTERACTIVE",
                    feedbackEdges: true,
                    mergeEdges : true,
                    //nodePlacement : "LINEAR_SEGMENTS"
                }
            });
            // //Previous opts not yet removed - do 
            // setPrevWordOpsRemoved(false);
        }
    }, [isReset, key, wordOptions, currentWord])

    // useEffect(() => {
    //     console.log("PREVIOUS WORD OPT SETTINGS:", prevWordOpsRemoved);
    // }, [prevWordOpsRemoved])

    //Each time the graph changes state, re-colour
    useEffect(() => {
        colorGraph();
    }, [graphData])
//
    //Whenever a new key is added, re-enable all branch connections and delete unused nodes
    useEffect(() => {

        //Set both flags to true
        biBackwardsCnxAllowed = true;
        triTetraCnxAllowed = true;

    }, [currentWord])

    useEffect(() => {
        //Delete previous wordOptions if the graph has been rendered and the current word / keys added have changed
        removePreviousOptions();
        //Set the flag to false
        setPendingNodesAdded(false);
        
    }, [currentWord, keysAdded])
    
    // useEffect(() => {
    //     console.log("THE CURRENT WORD IS:", currentWord);
    // }, [currentWord])
    //Check for when the layout is no longer undefined (that is, it has been rendered) and update accordingly
    useEffect(() => {
        if (layout !== undefined) {
            setLayoutBuilt(true);
        }
    }, [layout])

    //The aforementioned functions are triggered by the wordChosen function located in ManualTextOptions
    //For automatic text generation, we want to trigger this function automatically every few seconds and thus render the graph without any clicks
    //Define automatic generation logic

    useEffect(() => {
        //Set an interval to repeat each second
        const wordSelectionInterval = setInterval(() => {
            //Verify that the text generation mode is automatic and that the graph has been reset
            //Verify additionally that text has been generated and that the counter is not larger than the length of the generated text
            if (textGenMode === "automatic" && isReset && generatedText !== "" && genCounter < generatedText.split(" ").length) {
                //Set currentWord to the word of generated text located at index genCounter
                setCurrentWord(generatedText.split(" ")[genCounter].replace("<PERIOD>", ".").replace("<EXCL>", "!").replace("<Q>", "?").trim());
                //Increment counter
                genCounter++;
                //Otherwise, clear the interval
            } else {clearInterval(wordSelectionInterval);}
        }, 1000);

        //Clear interval when finished
        return () => clearInterval(wordSelectionInterval);
        
    }, [textGenMode, isReset, generatedText]) 

    //When the generated text changes, set the counter back to zero
    useEffect(() => {
        //Do so as long as the mode of generation is automatic
        if (textGenMode === "automatic") {
            genCounter = 0;
        }
    }, [generatedText, textGenMode])

    // =========== ALL DISPLAY CONTENT ===========

    //Render content to the fourth pane
    return (
        <div className = "visualizations" class = "flex flex-col space-y-2 h-full w-full items-center justify-center rounded-md bg-zinc-50 drop-shadow-md">
            <div className = "panel-4-header" class = "flex flex-row h-fit w-11/12 align-center items-center justify-center space-x-4">
                <p className = "text-entrance-text" class = "flex-auto font-bold monitor:text-lg 2xl:text-sm xl:text-sm sm:text-xs">[4] Visualize {modelType}.</p>
                <div className = "instructions" class = "flex flex-col justify-end items-right text-right w-1/2 h-full">
                    <p className = "instruction1" class = "flex-auto monitor:text-base 2xl:text-sm xl:text-sm sm:text-xs">Mouse wheel / trackpad to zoom.</p>
                    <p className = "instruction1" class = "flex-auto monitor:text-base 2xl:text-sm xl:text-sm sm:text-xs">Left button to pan (click and drag).</p>
                </div>
            </div>
            <div id = "cyto-frame" className = "visualization-graph" class = "flex w-11/12 h-5/6 bg-white rounded-md">
                {layoutBuilt && <CytoscapeComponent className = "graph" id = "graph" class = "h-full w-full" stylesheet = {graphStyle} elements = {graphData} layout = {layout} style = {{width : '100%', height : "100%"}} ref = {graphRef}/>}
                {!layoutBuilt && <div className = "loading" class = "flex h-full w-full text-center align-center items-center justify-center">Loading...</div>}
            </div>
        </div>
    )
}
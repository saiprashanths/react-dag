import React , { Component } from 'react';
import ReactDOM from 'react-dom';
import {configureStore} from './dag-store';
import {getSettings} from './dag-settings';
import uuid from 'node-uuid';

require('./styles/dag.less');
require('jsPlumb');

var classnames = require('classname');

export class DAG extends Component {
  constructor(props) {
    super(props);
    this.props = props;
    let {data, additionalReducersMap, middlewares = []} = props;
    this.store = configureStore(
      data,
      additionalReducersMap,
      [...middlewares]
    );
    this.state = this.store.getState();
    if (props.data) {
      this.toggleLoading(true);
    }
    this.endpoints = [];
    if (props.settings) {
      this.settings = Object.assign({}, props.settings);
    } else {
      this.settings = getSettings();
    }
    this.store.subscribe( () => {
      this.setState(this.store.getState());
      setTimeout(this.renderGraph.bind(this));
    });

    jsPlumb.ready(() => {
      let dagSettings = this.settings.default;
      let container = document.querySelector(`${this.state.componentId} #dag-container`);
      jsPlumb.setContainer(container);
      this.instance = jsPlumb.getInstance(dagSettings);
      this.instance.bind('connection', this.makeConnections.bind(this));
      this.instance.bind('connectionDetached', this.makeConnections.bind(this));
    });
  }
  toggleLoading(loading) {
    this.store.dispatch({
      type: 'LOADING',
      payload: {
        loading: loading
      }
    });
  }
  renderGraph() {
    this.addEndpoints();
    this.makeNodesDraggable();
    this.renderConnections();
  }
  makeNodesDraggable() {
    let nodes = document.querySelectorAll('#dag-container .box');
    this.instance.draggable(nodes, {
      start: () => { console.log('Starting to drag')},
      stop: (dragEndEvent) => {
        this.store.dispatch({
          type: 'UPDATE_NODE',
          payload: {
            nodeId: dragEndEvent.el.id,
            style: {
              top: dragEndEvent.el.style.top,
              left: dragEndEvent.el.style.left
            }
          }
        });
        this.instance.repaintEverything();
      }
    });
  }
  makeConnections(info, originalEvent) {
    if (!originalEvent) { return; }
    let connections = this.instance
      .getConnections()
      .map(conn => ({
          from: conn.sourceId,
          to: conn.targetId
        })
      );
      this.store.dispatch({
        type: 'SET-CONNECTIONS',
        payload: {
          connections
        }
      });
  }
  renderConnections() {
    let connectionsFromInstance = this.instance
      .getConnections()
      .map( conn => ({
          from: conn.sourceId,
          to: conn.targetId
        })
      );
    let {nodes, connections} = this.store.getState();
    if (connections.length === connectionsFromInstance.length) { return; }
    connections
      .forEach( connection => {
        var sourceNode = nodes.find( node => node.id === connection.from);
        var targetNode = nodes.find( node => node.id === connection.to);
        var sourceId = sourceNode.type === 'transform' ? 'Left' + connection.from : connection.from;
        var targetId = targetNode.type === 'transform' ? 'Right' + connection.to : connection.to;
        var connObj = {
          uuids: [sourceId, targetId],
          detachable: true
        };
        this.instance.connect(connObj);
      });
  }
  addEndpoints() {
    this.store.getState()
      .nodes
      .forEach(node => {
        if (this.endpoints.indexOf(node.id) !== -1) {
          return;
        }
        this.endpoints.push(node.id);
        let type = node.type;
        switch(type) {
          case 'source':
            this.instance.addEndpoint(node.id, this.settings.source, {uuid: node.id});
            return;
          case 'sink':
            this.instance.addEndpoint(node.id, this.settings.sink, {uuid: node.id});
            return;
          default:
            this.instance.addEndpoint(node.id, this.settings.transformSource, {uuid: `Left${node.id}`});
            this.instance.addEndpoint(node.id, this.settings.transformSink, {uuid: `Right${node.id}`});
        }
      });
  }
  componentDidMount() {
    this.setState(this.store.getState());
    // Because html id needs to start with a character
    this.setState({componentId: 'A' + uuid.v4()});
    setTimeout( () => {
      this.toggleLoading(false);
      if (Object.keys(this.props.data || {}).length) {
        this.renderGraph();
        this.cleanUpGraph();
      }
    }, 1000);
  }
  addNode(node) {
    let {type, label} = node;
    this.store.dispatch({
      type: 'ADD-NODE',
      payload: {
        type,
        label,
        id: type + Date.now().toString().slice(8)
      }
    });
  }
  cleanUpGraph() {
    let {nodes, connections} = this.store.getState();
    let parent = document.querySelector(`#${this.state.componentId} .diagram-container`);
    let parentDimension = {
      height: parent.getBoundingClientRect().height,
      width: parent.getBoundingClientRect().width
    };

    this.store.dispatch({
      type: 'CLEANUP-GRAPH',
      payload: {nodes, connections}
    });

    this.store.dispatch({
      type: 'FIT-TO-SCREEN',
      payload: {nodes, connections, parentDimension}
    });
    setTimeout(this.instance.repaintEverything.bind(this));
  }
  componentWillUnmount() {
    this.store.dispatch({
      type: 'RESET'
    });
  }
  render() {
    const loadContent = () => {
      if (this.state.graph.loading) {
        return (
          <div className="fa fa-spin fa-refresh fa-5x"></div>
        );
      }
    };
    const loadNodes = () => {
      if (!this.state.graph.loading) {
        return (
          this.state.nodes.map(function(node) {
            return (
                <div className="box text-center" id={node.id} key={node.id} style={node.style}>
                  <div className={classnames({'dag-node': true, [node.type]: true})}></div>
                    <div className="label">{node.label}</div>
                </div>
              )
          })
        );
      }
    };
    return (
      <my-dag id={this.state.componentId}>
        {this.props.children}
        <div className="diagram-container">
          <div id="dag-container" style={
            {
              transform: 'scale(' +
              this.state.graph.scale +
              ') ' +
              'translate( ' +
              this.state.graph.translate +
              ')'
           }}>
            {loadContent()}
            {loadNodes()}
          </div>
        </div>
      </my-dag>
    );
  }
}

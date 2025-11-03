import React, {Component, Fragment} from 'react';
import PostUrls from "./PostUrls";
import WordCloud from "./WordCloud";
import WordList from "./WordList";
import TrendChart from "./TrendChart";
import WeeklyBreaking from  "./WeeklyBreaking";
import WordSummary from "./WordSummary"
import ResizableContainer from "../common/ResizableContainer";
import store from "../../store";
import {setIsPasswordChanged} from "../../actions/auth";

export default class Dashboard extends Component {

    componentDidMount() {
        store.dispatch(setIsPasswordChanged());
    }

    constructor(props) {
        super(props);
        this.state = {
            postUrls: [],
            word: "",
            filteredLeads: []
        }
    }

    setPostUrls = (postUrls, word) => {
        this.setState({
            postUrls: postUrls,
            word: word
        })
    };

    handleDataFiltered = (filteredData) => {
        this.setState({ filteredLeads: filteredData });
    };

    render() {
        const { word } = this.state;
        
        return (
            <Fragment>
                <WeeklyBreaking />
                <div className="container-fluid mt-3">
                    <div className="row">
                        <div className="col-12">
                            <ResizableContainer
                                leftComponent={
                                    <WordCloud 
                                        setPostUrls={this.setPostUrls}
                                        filteredData={this.state.filteredLeads}
                                    />
                                }
                                rightComponent={
                                    <WordList 
                                        setPostUrls={this.setPostUrls}
                                        onDataFiltered={this.handleDataFiltered}
                                    />
                                }
                                defaultLeftWidth={58}
                                minLeftWidth={30}
                                maxLeftWidth={80}
                                storageKey="watcher_localstorage_layout_threatsWatcher"
                            />
                        </div>
                    </div>

                    {word && (
                        <div className="row mt-3">
                            <div className="col-12">
                                <ResizableContainer
                                    leftComponent={
                                        <WordSummary word={word}/>
                                    }
                                    rightComponent={
                                        <PostUrls postUrls={this.state.postUrls} word={word}/>
                                    }
                                    defaultLeftWidth={36}
                                    minLeftWidth={30}
                                    maxLeftWidth={80}
                                    storageKey="watcher_localstorage_layout_postUrls_summary"
                                />
                            </div>
                        </div>
                    )}
                    
                    <div className="row mt-4">
                        <div className="col-lg-12 ms-auto">
                            <TrendChart postUrls={this.state.postUrls} word={this.state.word}/>
                        </div>
                    </div>
                </div>
            </Fragment>
        )
    }
}
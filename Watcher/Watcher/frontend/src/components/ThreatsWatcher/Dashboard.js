import React, {Component, Fragment} from 'react';
import {connect} from 'react-redux';
import {getLeads, getMonitoredKeywords} from "../../actions/leads";
import PostUrls from "./PostUrls";
import WordCloud from "./WordCloud";
import WordList from "./WordList";
import TrendChart from "./TrendChart";
import WeeklyBreaking from  "./WeeklyBreaking";
import WordSummary from "./WordSummary";
import ResizableContainer from "../common/ResizableContainer";
import store from "../../store";
import {setIsPasswordChanged} from "../../actions/auth";

class Dashboard extends Component {
    constructor(props) {
        super(props);
        this.state = {
            postUrls: [],
            word: "",
            filteredLeads: []
        };
        this.loadingTimer = null;
    }

    componentDidMount() {
        store.dispatch(setIsPasswordChanged());
        this.loadInitialData();
        this.props.getMonitoredKeywords();
    }

    componentWillUnmount() {
        if (this.loadingTimer) {
            clearTimeout(this.loadingTimer);
        }
    }

    loadInitialData = async () => {
        try {
            await this.props.getLeads(1, 100);

            this.loadingTimer = setTimeout(() => {
                this.loadRemainingLeadsInBackground();
            }, 500);
        } catch (error) {
        }
    };

    loadRemainingLeadsInBackground = async () => {
        const { leadsNext } = this.props;
        
        if (!leadsNext) {
            return;
        }

        try {
            let currentPage = 2;
            let hasMore = true;

            while (hasMore) {
                try {
                    const response = await this.props.getLeads(currentPage, 100);
                    hasMore = response.next !== null;
                    currentPage++;

                    if (hasMore) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (error) {
                    hasMore = false;
                }
            }
        } catch (error) {
        }
    };

    setPostUrls = (postUrls, word) => {
        this.setState({
            postUrls: postUrls,
            word: word
        });
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
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        height: '100%',
                                        minHeight: '400px'
                                    }}>
                                        <WordCloud 
                                            setPostUrls={this.setPostUrls}
                                            filteredData={this.state.filteredLeads}
                                        />
                                    </div>
                                }
                                rightComponent={
                                    <WordList 
                                        setPostUrls={this.setPostUrls}
                                        onDataFiltered={this.handleDataFiltered}
                                    />
                                }
                                defaultLeftWidth={50}
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
                                    defaultLeftWidth={50}
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
        );
    }
}

const mapStateToProps = state => ({
    leads: state.leads.leads || [],
    leadsCount: state.leads.leadsCount || 0,
    leadsNext: state.leads.leadsNext || null
});

export default connect(mapStateToProps, {getLeads, getMonitoredKeywords})(Dashboard);
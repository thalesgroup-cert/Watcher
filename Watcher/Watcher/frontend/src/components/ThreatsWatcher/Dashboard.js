import React, {Component, Fragment} from 'react';
import PostUrls from "./PostUrls";
import WordCloud from "./WordCloud";
import WordList from "./WordList";
import TwitterTweet from "./TwitterTweet";
import TrendChart from "./TrendChart";
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
            word: ""
        }
    }

    setPostUrls = (postUrls, word) => {
        this.setState({
            postUrls: postUrls,
            word: word
        })
    };

    render() {
        return (
            <Fragment>
                <div className="container-fluid mt-3">
                    <div className="row">
                        <div className="col-lg-7 ml-auto">
                            <WordCloud setPostUrls={this.setPostUrls}/>
                        </div>
                        <div className="col-lg-5 ml-auto">
                            <WordList setPostUrls={this.setPostUrls}/>
                        </div>
                    </div>
                    <div className="row justify-content-lg-center">
                        <div className="mt-3 col-lg-4 ml-auto">
                            <TwitterTweet postUrls={this.state.postUrls} word={this.state.word}/>
                        </div>
                        <div className="mt-3 col-lg-7 ml-auto">
                            <PostUrls postUrls={this.state.postUrls} word={this.state.word}/>
                        </div>
                    </div>
                    <div className="row mt-4">
                        <div className="col-lg-12 ml-auto">
                            <TrendChart postUrls={this.state.postUrls} word={this.state.word}/>
                        </div>
                    </div>
                </div>
            </Fragment>
        )
    }
}